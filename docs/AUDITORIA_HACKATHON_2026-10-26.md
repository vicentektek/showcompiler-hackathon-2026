# Auditoría de SHOWCOMPILER — Hackathon Meta AI
**Fecha:** 26 de octubre de 2026  
**Revisión:** código GitHub, pruebas CI, guía oficial del participante, documentación Meta Model API y exploración del panel de facturación (sin acceso a credenciales ni verificación financiera).

## 1. Reglas que condicionan la entrega

Fuente del organizador: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details (Participant Guide, sesión de participante).

- Solo se presentan como nuevas funciones construidas durante el hackathon. No incluir archivos anteriores ni atribuirlos al evento.
- **Integrar un modelo Meta es un requisito de pase/fallo** en la primera ronda.
- Repositorio accesible públicamente **en el momento de la entrega**.
- **Vídeo de 3 minutos** mostrando funciones nuevas, además de código y producto funcional.
- Fecha límite: miércoles **4 de noviembre, 21:00 EST** = jueves **5 de noviembre, 03:00** en España peninsular (CET).
- Puntuaciones segunda ronda: impacto **30%**, uso de herramientas Meta **25%**, ejecución técnica **20%**, demo **25%**.
- Itinerario **Indie Developer** permite presentar en solitario. La entrega se realiza en https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit.
- No se deben presentar activos sin derechos, ni copiar trabajo de terceros.

## 2. Estado de ramas y código

| Rama/PR | Qué existe | Pruebas verificadas | Qué NO demuestra |
| --- | --- | --- | --- |
| `main` | Documentación inicial del hackathon | No contiene la demo completa | No es candidato de entrega |
| `feat/hackathon-script-core` | Lector TXT, trazabilidad de líneas, propuestas manuales, aprobación, JSON, UI y Web Audio | 70/70 GitHub Actions | Audio no comprobado físicamente en el equipo, sin Meta AI |
| `feat/meta-model-cue-proposals` · [PR #3](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/3) | Meta Model API, esquema JSON, consentimiento, clave solo en Node, referencias validadas, trazabilidad de origen | 89/89 GitHub Actions | No hay petición con API key real ni credenciales verificadas |
| `spike/native-wasapi-2026-10-26` · [PR #2](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/2) | Programa Rust/CPAL 0.18.2 para enumerar salidas y tono de prueba opcional | CI Windows compila, 1 Rust test y EXE release publicado | No es motor de cues; no ASIO, no hardware ni latencia medidos |

**Aislamiento:** ambos PR en borrador. No fusionar mientras fallen pruebas de aceptación.

## 3. Auditoría funcional

**Verificado automáticamente**
- Líneas de guion y búsqueda, citas del guion, importación y validación JSON.
- No se ejecuta un cue solo porque una IA haya propuesto una acción.
- Audio en Web Audio: GO/STOP/FADE/PANIC probados con objetos simulados de AudioContext (no con altavoces reales).
- Enlace UI/AudioBackend mediante fachada intercambiable que **no declara ASIO ni buses profesionales**.
- Validación de respuesta de Meta por ambos lados del proxy local; URL de destino fija y secreto en variable de entorno.
- La ruta Meta y el ciclo de aprobación preservan un campo de procedencia `source` en el JSON.

**Pendiente — criterio de aceptación humano**
- [ ] `npm test` en el PC con la rama `feat/meta-model-cue-proposals`.
- [ ] Audio WAV/MP3 real audible en Chrome/Edge y STOP/FADE/PANIC sobre varios cues.
- [ ] Comprobar confirmación real de créditos/billing de Meta Model API. No introducir claves en el chat ni en Git.
- [ ] Una petición real a Muse Spark que genere propuestas válidas para un guion de prueba.
- [ ] Aprobar al menos dos propuestas, verificar el audio y reabrir JSON con procedencia Meta.
- [ ] Evaluar calidad de sugerencias: aciertos sobre guion, falsos positivos, líneas correctas y recursos compatibles.
- [ ] Probar caso sin red: los cues ya aprobados deben poder ejecutarse sin Meta.
- [ ] Comprobar en Windows el EXE de enumeración WASAPI. La prueba audible `--beep` es voluntaria, con volumen bajo.
- [ ] Vídeo de 3 minutos, README de jurado, capturas, repositorio público y entrega.

## 4. Dependencias y riesgos

**Crítico: acceso real a Meta AI.** Los organizadores ofrecen solicitar $150 en créditos de Meta Model API en https://docs.google.com/forms/d/e/1FAIpQLScam78z7tHsNYibiFyJQVFzEgr0coyBTiY568SxxNbsPa3jiw/viewform . La comunicación oficial indica que se debe **registrar una tarjeta** para emitir llamadas, y que los créditos se asignan por tandas. La alerta «Spend Limit» que menciona la guía no debe interpretarse automáticamente como un corte garantizado de gastos. El panel de billing pidió una nueva verificación de identidad; no se ha confirmado el saldo. La solicitud de créditos en un socio tercero NO concede automáticamente créditos de Meta Model API.

**Alto: débil diferenciación.** La generación de una lista corta de cues es una primera integración correcta, pero conviene que el jurado vea verificación de fuentes, justificación de la propuesta y reproducción audiovisual real. No presentar el mock como una generación del modelo.

**Alto: sonido no completamente portable.** El JSON v1 incluye metadatos de sonidos, pero NO los audios. Un show exportado necesita recargar por nombre WAV/MP3 locales. No utilizar la demo en un directo profesional real.

**Alto: coherencia del trabajo nuevo.** El repositorio anterior `vicentektek/SHOWCOMPILER` sirve para investigación de requisitos, sin copiar código preexistente en esta entrega. Guardar historial de commits fechado y describir claramente las aportaciones posteriores al inicio.

**Medio: API de Meta.** Documentación oficial confirma `muse-spark-1.3`, Chat Completions, `response_format: json_schema` y rol `developer`. El código se ajustó a razonamiento `low` para extracción. Quedan por medir latencia y coste por solicitud en cuenta real, sin asumir soporte no probado.

**Medio: ASIO.** El spike usa WASAPI, no implementa ASIO ni añade SDK propietario. La capa de audio nativo requiere desarrollo nuevo de mezclador, instancias, buses y dispositivos; no desviar prioridad de la demo del jurado.

## 5. Próximo orden recomendado

1. **Hoy:** confirmar saldo Meta y acceso a la clave, ejecutar `git fetch` y cambiar a la rama Meta sin descartar archivos locales, probar 89 tests.
2. **Primera prueba de usuario:** guion + WAV corto → propuesta manual → aprobación → audio GO, STOP y PANIC.
3. **Primera inferencia real:** habilitar Meta solo tras revisar créditos y facturación; un único análisis de un guion original no confidencial, guardar resultado y captura.
4. **Pulir demo:** mostrar referencia «Ver en guion», estado del sonido, procedencia real y resultados antes/después. Reproducir 2–3 cues seleccionados.
5. **Semana:** entregar ejecutable o alternativa fácil de instalar si las pruebas lo justifican; probar repetidamente con Internet desactivado durante ejecución.
6. **Antes de cierre:** documentación de jurado, 3 minutos de vídeo, repositorio público y envío formal.

## 6. Límites de verificación

- CI verde no significa audio audible ni permisos Meta activos.
- No se ha verificado saldo bancario ni realizado cargos.
- No hay autorización para publicar el repositorio o activar facturación por cuenta del usuario sin instrucción expresa.
- No se han fusionado las ramas ni importado código anterior.
- Confirmar siempre en el portal que reglas/fecha siguen siendo vigentes; la página pública de presentación no sustituye la guía autenticada.
