import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
      REACT_APP_SUPABASE_URL: JSON.stringify(process.env.REACT_APP_SUPABASE_URL || ''),
      REACT_APP_SUPABASE_ANON_KEY: JSON.stringify(process.env.REACT_APP_SUPABASE_ANON_KEY || ''),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
})
