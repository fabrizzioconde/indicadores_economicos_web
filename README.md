# Macro Insights Web

Frontend em **React + TypeScript + Vite + Recharts** para visualizar os indicadores macroeconômicos do projeto Macro Insights MVP. Consome a API REST em `macro_insights_mvp` (FastAPI).

## Pré-requisitos

- **Node.js** 18+ e **npm**
- A **API** do projeto `macro_insights_mvp` deve estar rodando (veja o README do MVP).

## Instalação

Na pasta `macro_insights_web`:

```bash
npm install
```

## Desenvolvimento

1. Inicie a API (na pasta `macro_insights_mvp`):

   ```bash
   uvicorn api.main:app --reload --port 8000
   ```

2. Inicie o frontend (na pasta `macro_insights_web`):

   ```bash
   npm run dev
   ```

O app abrirá em `http://localhost:5173`. O Vite faz proxy de `/api` e `/health` para `http://localhost:8000`, então em dev não é necessário configurar `VITE_API_URL`.

## Variável de ambiente (opcional)

Para apontar para outra URL da API (por exemplo em produção), crie um arquivo `.env` na pasta `macro_insights_web`:

```
VITE_API_URL=http://localhost:8000
```

Há um `.env.example` como referência.

## Build para produção

```bash
npm run build
```

Os arquivos estáticos ficarão em `dist/`. Para pré-visualizar:

```bash
npm run preview
```

## Estrutura

- `src/App.tsx` — página principal: KPIs e gráfico de série por indicador
- `src/api.ts` — cliente HTTP para os endpoints da API
- `src/index.css` — tema escuro (paleta amarelo/azul)
- Gráficos com **Recharts** (linha temporal)
