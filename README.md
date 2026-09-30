# Fitness Assistant — Portfolio Edition

O **Fitness Assistant** é um assistente virtual educativo voltado a treinos, alimentação, recuperação e hábitos saudáveis. Ele interpreta a pergunta do usuário, considera seu contexto e produz orientações claras e personalizadas, sempre respeitando limites de segurança.

**Aplicação:** [fitness-assistant.brunaedna68.workers.dev](https://fitness-assistant.brunaedna68.workers.dev/)

## Principais recursos

- Atendimento em português e inglês.
- Sugestões de exercícios, treinos, alimentação, hidratação e recuperação.
- Respostas contextuais de acordo com objetivo, experiência e preferências do usuário.
- Base determinística própria com 2.500 registros organizados em oito temas.
- Integração opcional com as APIs Groq e Google Gemini.
- Fallback automático entre provedores externos, com timeout configurável.
- Rastreabilidade das chamadas por identificador de requisição e logs estruturados.
- Mecanismos de segurança para situações que envolvam dor, lesões ou riscos à saúde.
- Consentimento explícito antes do envio de informações para serviços externos de IA.
- Controles para gerenciar e excluir os dados locais da sessão.

## Como funciona

Cada mensagem passa por módulos de identificação de intenção, contexto, segurança e qualidade. O sistema utiliza primeiro seus mecanismos locais e pode recorrer à Groq ou ao Gemini para complementar a resposta quando houver consentimento e uma API configurada. Se os serviços externos não estiverem disponíveis, o assistente continua funcionando com o mecanismo local.

## Organização do código

O `app.js` coordena a interface e o fluxo da conversa. As responsabilidades independentes ficam isoladas em módulos próprios:

- `conversation-utils.js`: normalização, idioma, duração e roteamento multilíngue;
- `food-plan-utils.js`: porções e totais de estruturas alimentares;
- `nutrition-engine.js`: composição nutricional baseada na base local;
- `periodization-engine.js`: criação e adaptação de ciclos de treino;
- `safety-engine.js`: classificação de risco e bloqueio de respostas inseguras;
- `profile-manager.js`: validação e isolamento dos dados do visitante;
- `intent-engine.js`, `dialogue-engine.js` e `knowledge-engine.js`: interpretação e continuidade da conversa.
- `lib/fitness-api/input.js`: contrato, validação e sanitização das requisições;
- `lib/fitness-api/provider-clients.js`: adaptadores isolados para Groq e Gemini;
- `lib/fitness-api/chat-service.js`: orquestração e fallback entre os provedores;
- `lib/fitness-api/http.js`: respostas HTTP, correlação e observabilidade;
- `lib/fitness-api/rate-limiter.js`: proteção contra excesso de requisições por instância.

As regras puras podem ser testadas sem navegador, enquanto o Playwright valida a integração completa entre perfil, privacidade e chat.

O backend segue separação de responsabilidades e inversão de dependências: a orquestração depende do contrato dos provedores, permitindo substituir integrações e testá-las com implementações controladas sem acessar APIs reais.

## Tecnologias utilizadas

- HTML5, CSS3 e JavaScript com módulos ES.
- Cloudflare Workers para hospedagem e API segura no servidor.
- Wrangler para desenvolvimento e implantação.
- Groq API e Google Gemini API para recursos opcionais de IA.
- Mecanismos próprios para intenção, exercícios, nutrição, periodização, segurança e privacidade.
- Node.js para o processo de build.

## Executar localmente

```bash
npm install
```

Copie o arquivo `.env.example` para `.env` e, caso queira testar os provedores externos, informe `GROQ_API_KEY` e/ou `GEMINI_API_KEY`. As chaves são opcionais porque existe um mecanismo local de resposta.

Em seguida, execute:

```bash
npm run dev
```

## Testes

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

O teste de interface configura a privacidade e o perfil do visitante antes de validar uma orientação do motor local.

Os testes da API também validam o contrato de entrada, sanitização de dados, fallback de provedores e limitação de requisições sem consumir serviços externos.

## Operação e observabilidade

Cada resposta da API inclui `requestId` no corpo e o cabeçalho `X-Fitness-Request-Id`. Esse identificador permite correlacionar uma falha exibida pelo cliente com os logs estruturados do Cloudflare. As respostas do chat também expõem `Server-Timing`, sem registrar mensagem, perfil ou outros dados pessoais nos logs.

Quando um provedor externo falha, o serviço tenta o próximo provedor configurado. Se nenhum estiver disponível, o navegador mantém o fallback para o mecanismo local. Respostas de limite de uso retornam HTTP `429` e o cabeçalho `Retry-After`.

## Implantação

```bash
npm run build
npx wrangler deploy
```

As chaves de API usadas em produção devem ser cadastradas como segredos do Cloudflare Worker e nunca enviadas ao repositório ou ao navegador.

## Aviso importante

O Fitness Assistant possui finalidade educativa e não substitui avaliação médica, nutricional ou profissional. Esta versão foi desenvolvida como projeto independente de portfólio, sem dados, credenciais ou materiais proprietários de empresas ou clientes.

## Autoria

Desenvolvido por **Bruna Edna Martins Ferreira**.
