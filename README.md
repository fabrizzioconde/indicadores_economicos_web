# indicadores_economicos_web

Aplicação web (React/Vite) para visualização de indicadores econômicos, com painéis SignalEconomics, SignalRetail e estrutura setorial (Agro, Indústria, Energia).

## Pré-requisitos

- Node.js 18+ e npm
- API do projeto backend em execução

## Instalação

```bash
npm install
```

## Desenvolvimento

1. Inicie a API (backend):

```bash
uvicorn api.main:app --reload --port 8010
```

2. Inicie o frontend:

```bash
npm run dev
```

O app abre em `http://localhost:5173`.

## Variável de ambiente

Use `.env` para apontar para outra API:

```env
VITE_API_URL=http://localhost:8010
```

## Build

```bash
npm run build
```

Arquivos de produção em `dist/`.
