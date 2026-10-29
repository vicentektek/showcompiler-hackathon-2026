# RUNQ V14 + AI Agent — auditoría de arranque, integridad y aceptación (29-10-2026)

**Estado:** revisión del repositorio privado y de la CI de GitHub. No se ha accedido al PC del operador, a sus dispositivos ni a credenciales. No se han efectuado consultas pagadas. Cambios en PR #109 (draft); no fusionar main.

## 1. Baseline, trazabilidad y reproducción

- `main` contiene solo documentación y no es ejecutable como RUNQ V14.
- V13 PR #102 -> V14 PR #107 -> agente global PR #108 -> correcciones PR #109.
- V14 #107 / HEAD `f1ff9a6`: CI verde.
- Agente #108 / HEAD `90c60da`: CI verde.
- Correcciones #109: primer HEAD `1e8c74f` pasó CI (suite offline, Chrome con audio simulado). Después se integró el HEAD actualizado del agente y se corrigió la documentación: consultar CI del HEAD final.
- La edición con IA solo está permitida en Studio y el transporte es propiedad de `src/ui/app.mjs`, no del agente.
- Fuente de verdad de pruebas: `.github/workflows/core-tests.yml`; 85 archivos en `test/` enumerados en esta auditoría.

## 2. Hallazgos priorizados

| ID | Prioridad | Hallazgo / impacto | Estado / medida |
| --- | --- | --- | --- |
| START-01 | P0 para diagnóstico | `main` no arranca la app real; probar la rama errónea invalida resultados | Detectado; preflight y README aclaran worktree correcto |
| AGENT-01 | P0 de seguridad de edición | Vista previa comparaba cinco campos; eliminar cues podía alterar automáticamente `automation.stopCueIds` sin reflejarlo | Corregido en `agentCore.mjs`; test de regresión |
| AGENT-02 | P1 | Vista previa cortaba cambios después de 75 y permitía aplicar; operator no podía revisar todo | Corregido y E2E con 81 cues |
| START-02 | P1 | README decía que no había dependencias, pero RAR/7z exige libarchive.js instalado con npm | README actualizado y advertencia de preflight |
| AUDIO-01 | P1 | Biblioteca de comprimidos limita archivo a 64 MB, un audio a 20 MB y lote a 100 MB; ZIP64 no admitido | Limitación real: no ampliar límites sin streaming y protección de memoria |
| AUDIO-02 | P1 | JSON guarda metadatos, no bytes de audio; un proyecto reabierto por JSON puede tener medios ausentes | Usar `.showcompiler.zip` completo; probar roundtrip |
| HARDWARE-01 | P0 para pase a uso real | CI no escucha altavoces, no mide latencia RF/ASR ni valida interfaz USB o microfónía real | Pendiente de test manual en Windows |
| VOICE-01 | P1 | Autopiloto por pies tiene pruebas sintéticas; WER, falsos GO/hora y latencia con actores no medidos | Validación manual por sesiones; no automatizar en Directo |
| IA-01 | P1 | Ruta Meta/Baseten requiere claves vigentes, autorización expresa y crédito; tests de proveedores solo son mocks | No ejecutar pruebas pagadas hasta confirmar saldo/cap y credenciales |
| DOC-01 | P2 | Plan antiguo de audio dice que voz nunca hace GO; documento posterior de Autopiloto contempla GO armado en Ensayo | Documentar precedencia del comportamiento actual |
| DESKTOP-01 | P2 | App usa Node + navegador; no hay ejecutable Windows/ASIO/PFL garantizado | Mantener honestidad en interfaz y demo |

P0 funcional significa bloqueo de uso sin verificación adicional; no implica que el fallo se haya observado en la máquina del operador.

## 3. Cobertura y límites de la CI

| Módulo | Evidencia automática | No probado por esta auditoría |
| --- | --- | --- |
| Núcleo / proyecto | Node sintaxis, `test/*.test.mjs`, JSON/ZIP y checksums | Proyectos del operador y sistema de ficheros Windows |
| Cue/GO/NEXT/STOP | Unidades de motor, cola, fade, loops, safety y Chrome simulando audio | Nivel audible, interfaces multicanal, latencia perceptual |
| Biblioteca | Tests ZIP/RAR/7z, import y E2E por lotes | WAV grandes y archivos reales dañados/cifrados |
| Sound Lab | Contratos, selección y Chrome offline | Generación Modal real y escucha de la toma aceptada |
| Guion | L# estables, navegación, evidencia | Escala de guiones muy grandes y edición prolongada |
| IA de cues | Validadores, evaluación sintética | Precisión real Muse/Meta/Baseten contra gold humano |
| Agente | Plan/confirmación/undo, permisos, E2E 81 cues | Consultas pagadas, modelos reales y UX en Windows 900x600 |
| Ensayo / ASR | E2E con voces sintéticas y WAV locales | Micrófono real, acentos, ruido, cambios de escena |
| Autopiloto | Salto, retroceso, repetición, bloqueo sin ARM | Falsos GO/hora, WER/CER, p95 de latencia |
| Directo | DOM/controles y estado con motor simulado | Operación horas seguidas, fallos de interfaz/hardware |
| Idiomas | Pruebas i18n, lógica ES/EN | Revisión completa de todos los textos tras cambios |

**CI verde = contrato de código y Chrome sintético, no aceptación del espectáculo en sala.**

## 4. Prueba local Windows sin alterar tu otra instalación

Primero conserva cualquier `.showcompiler.zip` de trabajo. No ejecutes `git reset --hard` y no pegues claves en chats/logs.

```powershell
cd "C:\Proyectos\Hackaton 2026\showcompiler-hackathon-2026"
git status --short --branch
git fetch origin
git worktree add -b "local/runq-audit-2026-10-29" "..\showcompiler-runq-qa" "origin/fix/runq-v14-agent-audit-2026-10-29"
cd "..\showcompiler-runq-qa"
npm install --no-audit --no-fund
powershell -ExecutionPolicy Bypass -File .\tools\runq-preflight.ps1 -RunTests -StartServer
```

Abrir la URL local mostrada por el script (`127.0.0.1`, puerto 5173, 5174 o 5180). Usar Chrome/Edge actualizado. `npm install` solo descarga la dependencia de archivo; no hace solicitudes de inferencia.

Si hay error, conservar: primer FAIL del preflight; comando que lo produjo; error rojo en DevTools > Console (sin claves ni datos privados); rama SHA. No publicar el .env.

## 5. Recorrido manual de aceptación, en orden seguro

1. **Arranque:** Home y topbar visibles; navegar Audio, Guion, Cues, Ensayo, Directo sin pantalla blanca ni errores de consola.
2. **Proyecto/guion:** crear un show de prueba en español; importar TXT UTF-8; buscar L#; repetir con inglés; nunca cambia el original.
3. **Cues:** crear 3 manuales; seleccionar no debe lanzar audio; Set NEXT y Play deben ser distintos; renombrar, duplicar y reordenar.
4. **Biblioteca:** importar varios WAV pequeños; preescuchar; detener; arrastrar a Cue List y comprobar numeración. Probar ZIP simple aparte. Nunca asumir PFL; misma salida que GO.
5. **Editor/audio:** asociar cue, modificar IN/OUT y fade; comprobar forma de onda verdadera y escucha, exportar/reabrir `.showcompiler.zip`.
6. **Transporte:** lanzar GO manual, pulsar STOP individual, FADE y STOP ALL; comprobar silencio y ningún GO retardado; dos cues simultáneos.
7. **Agente offline:** abrir RUNQ AI en Studio, pedir resumen y auditoría; proponer/eliminar un cue en proyecto de prueba, revisar diff, aplicar y deshacer. Entrar Ensayo/Directo y confirmar agente oculto.
8. **Ensayo:** con volumen bajo, comprobar micrófono y voz; primero modo asistido, luego AUTO GO armado explícitamente. Ejecutar siguiente pie, saltar, retroceder, repetir y desarmar. Nunca usar proyecto real en Directo en esta prueba.
9. **IA remota:** solo una vez que claves, cuota, consentimiento y saldo estén verificados; registrar latencia y si propuesta es útil. Sin ejecución pagada por CI.
10. **Estabilidad:** reiniciar navegador, abrir ZIP, verificar nombres, cues y bytes de audio; repetir a 1366x768, 900x600 y pantalla completa.

## 6. Criterios de bloqueo antes de la demo

- Ningún clic de inspección, IA o navegación emite GO.
- STOP ALL silencia y cancela avances pendientes; nunca reanuda solo.
- Ningún archivo ausente se presenta como reproducible.
- La revisión del agente muestra todos los cambios e impide aplicar un proyecto obsoleto.
- Autopiloto no arma ni ejecuta en Directo y se desarma al salir de Ensayo.
- JSON versus ZIP y audio de biblioteca se comunican sin inducir errores de uso.
- Consentimiento por solicitud externa, claves solo en Node, pruebas offline sin cobro.
- En Windows: consola sin excepciones y audición manual satisfactoria.

**Pendiente principal:** el síntoma preciso del fallo local anterior no ha podido reproducirse desde el acceso al repositorio. Ejecutar el preflight y reportar su primer error determina si el siguiente arreglo debe centrarse en arranque, UI, archivos, voz o proveedor de IA.
