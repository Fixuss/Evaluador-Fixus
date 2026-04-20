# Fixus — Evaluador Crediticio

Aplicación web para análisis de elegibilidad crediticia de empresas PyME.
Pipeline compartido, guardado automático en la nube.

---

## Despliegue en Vercel (15 minutos, gratis)

### Paso 1 — Crear cuenta GitHub
1. Ir a https://github.com y crear cuenta (si no tenés)
2. Confirmar el email

### Paso 2 — Subir el código a GitHub
1. En GitHub, clic en "New repository" (botón verde)
2. Nombre: `fixus-evaluador`
3. Dejarlo en "Public"
4. Clic "Create repository"
5. En la página que aparece, clic en "uploading an existing file"
6. Arrastrá TODOS los archivos de esta carpeta (respetando la estructura de carpetas)
7. Clic "Commit changes"

### Paso 3 — Crear cuenta Vercel
1. Ir a https://vercel.com
2. Clic "Sign Up" → elegir "Continue with GitHub"
3. Autorizar Vercel

### Paso 4 — Conectar el repositorio
1. En Vercel, clic "Add New Project"
2. Seleccioná el repositorio `fixus-evaluador`
3. Clic "Import"
4. Framework: Next.js (se detecta automáticamente)
5. Clic "Deploy" — esperar ~2 minutos

### Paso 5 — Agregar la base de datos (KV)
1. En Vercel, ir a tu proyecto → pestaña "Storage"
2. Clic "Create Database" → elegir "KV"
3. Nombre: `fixus-db`
4. Plan: Hobby (gratis)
5. Clic "Create"
6. Vercel conecta la base automáticamente al proyecto

### Paso 6 — Redesplegar
1. En Vercel → pestaña "Deployments"
2. Clic en los tres puntos del último deployment → "Redeploy"
3. Esperar ~1 minuto

### ¡Listo!
Tu app estará en: `https://fixus-evaluador-XXXX.vercel.app`

Compartí esa URL con la otra persona — acceden desde cualquier navegador,
el pipeline se guarda automáticamente para los dos.

---

## Estructura del proyecto

```
fixus/
├── pages/
│   ├── index.js          ← App principal (formulario, resultados, pipeline)
│   ├── _app.js           ← Entrada Next.js
│   └── api/
│       └── pipeline.js   ← API de guardado (Vercel KV)
├── lib/
│   └── financial.js      ← Motor de cálculo financiero y criterios
├── styles/
│   └── globals.css       ← Design system Fixus
├── package.json
└── next.config.js
```

---

## Uso diario

1. Abrí la URL en cualquier navegador
2. **Nueva empresa** → cargá los datos del balance
3. Clic **Analizar empresa** → ver resultado con score y semáforo
4. Clic **Agregar al pipeline** → queda guardado para los dos
5. **Criterios** → ajustá los umbrales cuando necesites
6. **Pipeline** → exportá a CSV cuando quieras

---

## Criterios configurados por defecto

| Criterio | Valor |
|----------|-------|
| Caída máxima de ventas entre ejercicios | 10% |
| Tendencia post-balance (meses en alza) | ≥ 60% |
| Deuda / ventas mensuales actuales | ≤ 4 meses |
| Deuda / EBITDA mensual | ≤ 4 meses |
| Capital de trabajo | Positivo |
| Liquidez corriente | ≥ 1.0x |
| Endeudamiento Pasivo/PN | ≤ 3.0x |
| Patrimonio neto mínimo | ≥ $3.000K |
| Antigüedad mínima | 3 años |
| Financiamiento máximo | $500.000K |
