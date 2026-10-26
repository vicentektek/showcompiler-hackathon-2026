# ADR-0001 — Arquitectura definitiva de audio Windows (2026-10-26)

**Estado: decisión de diseño adoptada; backend nativo NO implementado.** Trabajo nuevo escrito durante el Meta Global AI Developer Hackathon 2026, utilizando investigación como referencia, sin importar código de ningún proyecto anterior.

## 0. Resumen ejecutivo
SHOWCOMPILER es **desktop-first y offline-first**. El servidor actual `127.0.0.1:5173` no es una nube: es un servidor de desarrollo en el propio PC. La UI HTML/JS es reutilizable tanto en navegador de pruebas como en WebView2 dentro de un ejecutable Tauri 2. **Web Audio es un motor provisional, no la salida profesional definitiva.**

**Decisión:** conservar la capa de guion, propuestas, aprobación humana, cues e interfaz; separar transporte de audio mediante un contrato explícito. Objetivo de producto: **Tauri 2 + núcleo nativo Rust + CPAL (WASAPI en Windows inicialmente), con ASIO opcional y licenciado**. La integración nativa de audio debe funcionar y conservar la ejecución sin conexión ni modelo generativo.

## 1. Qué se conserva, qué se reemplaza

| Módulo | Estado/estrategia | Razón |
|---|---|---|
| TXT, líneas L1..Ln, búsqueda | Conservar | No depende de audio |
| IA Meta (por hacer) + validador + aprobación | Conservar | Fuera de ruta crítica de audio |
| Formato JSON v1 | Conservar/migrar después | Actualmente solo PLAY y metadatos, sin WAV; no afirmar compatibilidad futura automática |
| UI de cues y proyecto | Conservar y mejorar | Debe hablar con AudioBackend, no con Web Audio directo |
| `src/core/browserAudio.mjs` | Mantener como **adapter de demo** | GO/STOP/FADE/PANIC manuales y WAV/MP3; no ASIO |
| Transporte nativo + mezcla + routing | Construcción nueva pendiente | Requiere clocks, streams, drivers y tests en Windows |
| Instalador Windows/Tauri | Construcción nueva pendiente | No equivale a activar ASIO al envolver la web |
| MagicQ/timecode y Android | Fuera del audio MVP | Capacidad opcional posterior |

## 2. Comparación basada en capacidades (no benchmarks)

- **Web Audio (Chromium/WebView2):** cómodo para una demo y reproducción estéreo; buffer local, scheduling de AudioContext y fades. No presenta una API ASIO directa, ni garantiza selección/patcheo de los canales físicos de una interfaz profesional. No suponer latencia determinada: consultar `baseLatency`/`outputLatency` y medir físicamente.
- **WASAPI shared:** instalado con Windows, permite funcionar en el equipo sin SDK de terceros ni drivers ASIO. Microsoft documenta períodos cortos mediante IAudioClient3 en dispositivos compatibles. No equivale por sí mismo a elegir el número de canales de cualquier interfaz; comprobar capacidades reales de cada endpoint.
- **WASAPI exclusive:** potencial reducción de capas/formatos, pero monopoliza el endpoint y puede dejar sin otros sonidos al sistema. Valorar solo tras medir shared.
- **ASIO:** acceso mediante controlador del fabricante; ideal cuando sean imprescindibles múltiples salidas físicas y configuraciones profesionales. Necesita hardware/driver compatible y obligaciones de licencia que deben comprobarse **antes de distribuir** un ejecutable con ASIO.
- **Rust CPAL:** host WASAPI por defecto en Windows, ASIO opcional (feature `asio`), enumeración de dispositivos/streams, callbacks. Es una capa de E/S, NO un mezclador, secuenciador o reproductor de archivos completos: el engine de voces, decodificación, mezcla y planificación se programa aparte.
- **RtAudio C++:** alternativa razonable si las pruebas reales de CPAL bloquean routing/ASIO; añadir FFI/C++ aumenta complejidad.
- **miniaudio (C):** buena solución general WASAPI y decodificadores; no figura ASIO entre backends oficiales. No elegirlo como único transporte si ASIO es objetivo irrenunciable.

## 3. Diseño de procesos y responsabilidades

```text
┌─────────────────────────────────────────────────────┐
│ Frontend UI (HTML/JS dentro de Tauri 2 / WebView2)  │
│ guion · proyecto · lista cues · modos · inspectores │
│ «GO» del operador → comando tipado                   │
└───────────────────────┬─────────────────────────────┘
                        │ IPC comandos y ACK/estados
┌───────────────────────▼─────────────────────────────┐
│ Rust control thread (no tiempo real)                │
│ preflight · validación · estado · dispositivos       │
│ decode/stream workers · scheduling · fallbacks      │
└───────────────────────┬─────────────────────────────┘
                        │ cola acotada de comandos RT
┌───────────────────────▼─────────────────────────────┐
│ Rust audio callback CPAL / WASAPI / ASIO            │
│ reloj de muestras · voces · ganancia · buses         │
│ mezcla / salida física · PANIC prioritario           │
│ NO disco · NO red · NO malloc · NO locks · NO logs    │
└─────────────────────────────────────────────────────┘
```

Tauri ofrece comandos tipados para comunicación UI↔Rust. Los eventos/IPC son mensajes de control y estado, **nunca** una ruta que envíe cada bloque PCM del audio a través de JavaScript. El audio debe conservarse y producirse en Rust, independiente de los repintados del frontend.

## 4. Contrato de dominio y audio (propuesta v1, NO implementación)

- **Asset**: `assetId`, hash, ruta o contenido local autorizado, duración, sample rate, canales.
- **Cue**: `cueId`, orden, `sourceLineIds`, acciones y estado de aprobación.
- **PlayAction**: inicia una **instancia** nueva con `playId` estable, `assetId`, nivel, inicio, loop, delay y `busId`.
- **StopAction/FadeAction**: operan sobre el **playId** exacto; nunca confundir `assetId` con instancia en marcha.
- **Bus**: mezcla lógica independiente del canal físico; se asigna a `outputDeviceId` y `channelMap` explícitos tras enumerar capacidades.
- **Transport**: cue seleccionado ≠ cue preparado ≠ cues activos. `GO` exclusivamente del preparado.
- **Command**: `runId` + `epoch` + `commandId` + `cueId` + `prepareToken` evitan aceptar callbacks/GO de ejecuciones canceladas.
- **GO**: comprobar preflight → reservar → garantizar recursos/prebuffer → programar acciones para un mismo reloj nativo → commit solo si todas están admitidas. Tras fallo parcial, rollback o estado ERROR con salida silenciada y sin reintentos ocultos.
- **PANIC**: invalidar comandos pendientes y cortar ganancias/salidas. La parada no dependerá de que responda el frontend.
- **Clocks**: programar por número de muestras/bloques del dispositivo; no por `setTimeout()` de JS. Al tratar timecode, determinar offset/reloj y medir deriva.
- **Modo Directo**: la IA jamás ejecuta acciones directamente. El show aprobado funciona sin Internet.

### API lógica deseada

```text
listOutputDevices() -> capabilities/IDs
openOutput(deviceId, backend=WASAPI_SHARED|WASAPI_EXCLUSIVE|ASIO, format) -> status
loadAsset(assetId, secureLocalSource) -> decoded/streaming asset state
prepareCue(cueId) -> prepareToken | preflight errors
go(preparedCueId, prepareToken, commandId) -> runId + status ACK
stopPlay(playId) / fadePlay(playId, durationMs, targetGain)
panic() -> immediate local output shutdown/zeroing
getTransportStatus() -> active playIds, clock, driver, errors
closeOutput()
```

**Nota:** esto es un contrato lógico para la migración, no un API público implementado ni garantía de ASIO. La actual API BrowserAudioEngine actúa sobre `cueId`, así que **necesita adaptación antes de soportar STOP/FADE por `playId`**. Nunca declarar los dos modelos equivalentes.

## 5. Decodificación, mezcla y estado en tiempo real

1. Probar antes de arrancar el directo qué audios faltan y si el driver soporta canales/formatos requeridos.
2. Archivos cortos: decodificar por adelantado. Archivos largos: streaming desde worker no-RT con **ring buffer** y prebuffer; el callback no lee disco ni se bloquea.
3. Una sola línea de tiempo por dispositivo, acciones simultáneas en el mismo sample tick; cada `playId` tiene su propia envolvente de ganancia.
4. Mezcla N voces → buses → matrix explícita de salida M canales. Limitar picos y clipping con monitorización; no normalizar silenciosamente.
5. Si desaparece dispositivo/driver, pasar a ERROR visible, detener de manera segura, no hacer conmutación silenciosa a altavoces internos en directo.
6. Preescucha/CUE separado físicamente del PA si el hardware proporciona salidas independientes; en caso contrario no etiquetar PFL como independiente.
7. Cargar/guardar con hashes, rechazar rutas fuera del proyecto, validar proyecto y mantener original ante migraciones fallidas. JSON sin audio no es un show portable.
8. El callback CPAL es tiempo real: no reservar memoria, coger mutex, bloquear, llamar red/disco ni ejecutar lógica de UI/IA. Mensajería por colas acotadas y estados seguros.

## 6. Pruebas de aceptación nativas necesarias (no realizadas)

- Enumerar WASAPI real, seleccionar salida y sample rate, abrir/cerrar 10 veces y tras reinicio.
- Reproducir varios WAV/FLAC simultáneos; disparos repetidos, 1, 20 y 80 cues; fader independiente y PANIC.
- Loopback físico para latencia GO→salida y jitter; comparar WASAPI shared/exclusive/ASIO sobre el **mismo hardware** antes de afirmar una mejora.
- Variar bufer, sample rate 44.1/48/96 kHz si dispositivo soporta; probar underrun, saturación CPU, reproducción larga, reposo y hotplug.
- Verificar matrix 1–2 a PA y 3–4 a preescucha solo si hay interface con 4 canales visibles.
- Verificar audio muted después de PANIC bajo fallo de UI, cierre de ventana y GO pendiente.
- Distinguir resultados en mock, WASAPI real y ASIO real; no inventar latencia sin medidas ni ejecutar sonidos no autorizados.

## 7. Licencia ASIO: asunto crítico por repositorio público del hackathon

La FAQ oficial de Steinberg del **21-10-2026** explica:
- la licencia **propietaria es royalty-free y admite desarrolladores individuales**;
- el acuerdo firmado por ambas partes se exige antes de distribuir externamente una versión propietaria **incluso beta gratuita** habilitada con ASIO;
- usar CPAL/JUCE/PortAudio/RtAudio no elimina la obligación de licencia para una integración propietaria que emplee el SDK;
- el SDK ofrece alternativa bajo **GPLv3**, con obligaciones de licencia y distribución distintas;
- no incluir archivos del ASIO SDK bajo licencia propietaria dentro del repositorio público sin autorización.

**Acción:** arquitectura compatible con ASIO pero `asio` desactivado de forma predeterminada. No distribuir ni anunciar ejecución ASIO hasta resolver formalmente licencias, integración y pruebas con una interfaz real. WASAPI no depende del SDK ASIO.

## 8. Priorización de trabajo durante el hackathon

1. **Ahora:** confirmar fronteras; conservar Web Audio como driver de demo y evitar acoplar el dominio a AudioContext.
2. **Valor diferenciador del concurso:** conectar de verdad un modelo Meta para proponer cues de guion con referencias estrictas y aprobación humana; no dejarlo en mock.
3. **Primer ejecutable nuevo:** empaquetar UI mediante Tauri 2; no copiar código anterior; verificar offline, guardado de proyectos, audio local en Windows.
4. **Spike independiente nativo:** CPAL WASAPI enumeración + tono/WAV probado en Windows y comparado con Web Audio. Mantener en rama aislada; no desplazar la demo verificada.
5. **Motor escalable:** asignación de voces y buffers, PLAY por instancia, mezclador, buses y preescucha.
6. **ASIO opcional:** una vez revisada licencia, compilar habilitado, verificar canales reales y audio estable en dispositivos adecuados.
7. **No añadir:** control DMX/MagicQ, seguimiento autónomo por voz en directo o múltiples salidas ficticias antes de estabilizar audio.

## 9. Fuentes técnicas primarias (consultadas el 26-10-2026)

- Tauri 2 process model: https://v2.tauri.app/concept/process-model/
- Tauri 2 Rust command IPC: https://v2.tauri.app/develop/calling-rust/
- Tauri 2 Windows installer/offline WebView2: https://v2.tauri.app/distribute/windows-installer/
- CPAL backends/ASIO setup: https://github.com/RustAudio/cpal
- Microsoft low-latency WASAPI / IAudioClient3: https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/low-latency-audio
- Microsoft WASAPI exclusive: https://learn.microsoft.com/en-us/windows/desktop/coreaudio/exclusive-mode-streams
- MDN Web Audio baseLatency: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency
- Steinberg FAQ 21-10-2026: https://forums.steinberg.net/t/asio-sdk-proprietary-licensing-faq/1044024
- Steinberg SDK dual-license text: https://github.com/audiosdk/asio/blob/main/LICENSE.txt
- RtAudio: https://github.com/thestk/rtaudio
- miniaudio: https://github.com/mackron/miniaudio

**Próxima revisión de arquitectura:** cuando se valide en hardware Windows el backend WASAPI real. Esta ADR no demuestra que Rust/ASIO funcionen actualmente en el ejecutable del hackathon.
