# RunQ — guiones originales para pruebas automatizadas

**Fecha:** 27 de octubre de 2026. Todos los textos de este directorio se han escrito expresamente para probar RunQ. No proceden de obras comerciales, guiones privados ni transcripciones del seminario. Son ejemplos cortos de ensayo técnico, no obras completas de quince minutos.

| Nº | Guion | Qué verifica |
| --- | --- | --- |
| 01 | El último turno | personajes en líneas separadas, ambiente continuo, STOP, silencio |
| 02 | El eco del patio | timbre grabado frente a utilería y sonidos físicos |
| 03 | Gala del puerto | escaleta SONIDO/LX/VIDEO y fades |
| 04 | Sinfonía viva | musical en directo frente a audio grabado |
| 05 | Pista boreal | guion de regiduría: STANDBY/PREVENIR frente a GO |
| 06 | Mesa redonda | voz grabada frente a microfonía real |
| 07 | La station des brumes | texto francés, referencias y continuidad |
| 08 | Night crossing | instrucciones en inglés y silencio |
| 09 | La orden no fiable | prompt injection representada dentro del diálogo |
| 10 | Las dos frecuencias | dos fuentes simultáneas y STOP al objetivo correcto |
| 11 | Torre de sal | encabezado, 2 escenas, ventanas múltiples y continuidad |
| 12 | El reloj de los doce | **stress test deliberado**: 12 eventos > límite actual de 8 |

El archivo `../stage-scenarios-v2.json` contiene 60 eventos sonoros obligatorios señalados con referencias L#, más 45 líneas en las que un PLAY sería improcedente. Los STOP se vinculan a la línea PLAY de su fuente. Los gold labels se basan en un juicio técnico inicial y pueden requerir discusión profesional; no son la salida de un modelo.

## Uso desde VS Code

```powershell
npm run qa:scripts
npm run qa:codex
```

El primer comando genera `artifacts/stage-script-qa/report.md` y `report.json`; el segundo combina sintaxis, tests, el scorer existente, estos guiones y el resumen de Codex. Los directorios de informes generados están ignorados por Git.

**Lo que sí se prueba:** preservación de texto y L#, segmentación en ventanas, esquema de petición, parseo de JSON sintético completo, separación de PLAY frente a STOP/CONTINUE/SILENCE, validador independiente de acotaciones, objetivos STOP y límite de capacidad.

**Lo que no se prueba:** precisión real de Muse Spark, calidad creativa musical, audio físico de Windows/ASIO, consumo o latencia de la API, seguimiento automático de diálogo. Ningún test contacta al proveedor ni pone un cue en directo.

## Influencia del seminario

La sesión *Agents 101: Build a Multimodal AI Agent Pt. 1* sirvió de inspiración para separar **observación → planificación → respuesta estructurada → verificación independiente → decisión humana**. No afirmamos reproducir un agente del seminario ni ejecutar llamadas de herramienta reales. Solo usamos ideas transferibles que podemos verificar en código.

## Prioridad de mejora

Primero estudiar las acotaciones no detectadas por el verificador heurístico actual, manteniendo falsos positivos bajos: una voz recordando una alarma, luz, vídeo, música en directo, utilería y falsos comandos de GO no deben transformarse en audio automáticamente. Después estudiar los 12 efectos de una única ventana, relaciones STOP con dos sonidos simultáneos y exportación privada de resultados reales. Todo requiere revisión humana antes de integrar.