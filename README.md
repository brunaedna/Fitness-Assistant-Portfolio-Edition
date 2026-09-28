# Fitness Assistant — Portfolio Edition

O **Fitness Assistant** é um assistente virtual educativo voltado a treinos, alimentação, recuperação e hábitos saudáveis. Ele interpreta a pergunta do usuário, considera seu contexto e produz orientações claras e personalizadas, sempre respeitando limites de segurança.

**Aplicação:** [fitness-assistant.brunaedna68.workers.dev](https://fitness-assistant.brunaedna68.workers.dev/)

## Principais recursos

- Atendimento em português e inglês.
- Sugestões de exercícios, treinos, alimentação, hidratação e recuperação.
- Respostas contextuais de acordo com objetivo, experiência e preferências do usuário.
- Base determinística própria com 2.500 registros organizados em oito temas.
- Integração opcional com as APIs Groq e Google Gemini.
- Mecanismos de segurança para situações que envolvam dor, lesões ou riscos à saúde.
- Consentimento explícito antes do envio de informações para serviços externos de IA.
- Controles para gerenciar e excluir os dados locais da sessão.

## Como funciona

Cada mensagem passa por módulos de identificação de intenção, contexto, segurança e qualidade. O sistema utiliza primeiro seus mecanismos locais e pode recorrer à Groq ou ao Gemini para complementar a resposta quando houver consentimento e uma API configurada. Se os serviços externos não estiverem disponíveis, o assistente continua funcionando com o mecanismo local.

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
