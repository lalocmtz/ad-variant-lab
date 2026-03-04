

## Diagnostico

Hay **dos problemas** confirmados en los logs:

### Problema 1: Video demasiado largo para Kling
El log de `animate-kling` muestra:
```
KIE AI response: {"code":422,"msg":"Video duration must be between 3 and 30 seconds"}
```
El video de TikTok descargado dura **49 segundos**, pero Kling Motion Control solo acepta videos de **3 a 30 segundos**. Esto causa el error "Error enviando tarea" que ves en la UI.

### Problema 2: Endpoint de polling incorrecto
El `poll-kling` usa `POST /api/v1/jobs/queryTask` que **no existe** (404). Segun la documentacion oficial de KIE AI, el endpoint correcto es:
```
GET /api/v1/jobs/recordInfo?taskId=XXX
```
Ademas, la estructura de respuesta es diferente: usa `state` (waiting/queuing/generating/success/fail) y `resultJson` (contiene `resultUrls`).

---

## Plan de Correccion

### 1. `animate-kling/index.ts` — Manejar videos largos
- Antes de enviar a KIE AI, verificar la duracion del video usando los metadata que ya tenemos
- Si el video excede 30 segundos, usar la KIE AI File Upload API para subir el archivo recortado, O informar al usuario
- Solucion practica: pasar un parametro de duracion desde el frontend, y si excede 30s, agregar al payload la instruccion de usar solo los primeros 30 segundos. Sin embargo, KIE AI valida esto del lado del servidor.
- **Solucion real**: Necesitamos recortar el video a los primeros 30 segundos antes de enviarlo. Podemos hacer esto usando FFmpeg en el edge function (no disponible), o subir el video a traves de la File Upload API de KIE AI que podria manejar el recorte. La opcion mas viable es descargar el video, recortarlo en el edge function usando Web APIs, o simplemente **rechazar videos mayores a 30s con un mensaje claro al usuario** y eventualmente implementar recorte.
- **Opcion elegida**: Mostrar al usuario un error claro si el video excede 30s, y pasar la duracion como metadata desde el frontend para validar antes de enviar.

### 2. `poll-kling/index.ts` — Corregir endpoint y parsing
- Cambiar de `POST /api/v1/jobs/queryTask` a `GET /api/v1/jobs/recordInfo?taskId=XXX`
- Actualizar el parsing de la respuesta:
  - `data.data.state` en lugar de `data.status` (valores: waiting, queuing, generating, success, fail)
  - `JSON.parse(data.data.resultJson).resultUrls[0]` para obtener la URL del video

### 3. `KlingAnimationPanel.tsx` — Validacion de duracion
- Recibir `videoDuration` como prop desde `ResultsView`
- Mostrar advertencia si la duracion excede 30 segundos
- Deshabilitar el boton de animar si el video es demasiado largo

### 4. `ResultsView.tsx` y `Index.tsx` — Pasar duracion del video
- Propagar `metadata.duration` desde el estado de descarga hasta el panel de animacion

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/poll-kling/index.ts` | Corregir endpoint a GET recordInfo, actualizar parsing |
| `supabase/functions/animate-kling/index.ts` | Agregar validacion de duracion del video |
| `src/components/KlingAnimationPanel.tsx` | Agregar validacion de duracion, recibir prop |
| `src/components/ResultsView.tsx` | Pasar duracion del video al panel |
| `src/pages/Index.tsx` | Propagar duracion del video |

