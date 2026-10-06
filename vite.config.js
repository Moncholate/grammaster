import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

/* `2026-08-12 · e1f54ed`. Si no hay git (una copia descargada en zip, por
   ejemplo) devuelve 'dev' en vez de romper la compilación: el reporte de
   errores es útil, pero no al precio de no poder construir. */
function versionDelCommit() {
  try {
    const q = (c) => execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return `${q('git log -1 --format=%cs')} · ${q('git rev-parse --short HEAD')}`
  } catch { return 'dev' }
}

export default defineConfig({
  plugins: [react()],
  /* Versión para el reporte de errores. Sale del COMMIT y no de la hora de
     compilar, por dos motivos:
       · dice exactamente qué código está en línea, no cuándo se apretó el botón
       · es DETERMINISTA, así que el mismo commit da siempre el mismo bundle y
         se puede verificar un despliegue comparando el hash del archivo servido
         con el del compilado en local. Con la hora dentro, cada build daba un
         hash distinto y esa comprobación dejaba de funcionar. Pasó.
     Se escribe a mano nunca: una constante en el código se queda vieja el primer
     día que nadie se acuerda de subirla, y entonces miente. */
  define: {
    __APP_BUILD__: JSON.stringify(versionDelCommit()),
  },
  base: '/grammaster/',
  server: {
    port: 5174,
    open: false
  }
})
