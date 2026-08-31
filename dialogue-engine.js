/* Universal, session-only dialogue interpretation for short contextual messages. */
(function () {
  "use strict";

  const normalize = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9,.?\s-]/g, " ").replace(/\s+/g, " ").trim();

  function analyze(text) {
    const query = normalize(text)
      .replace(/\bpfv?\b/g, "por favor")
      .replace(/\bdificel\b/g, "dificil")
      .replace(/\bproxima opcao\b/g, "outra opcao");
    const command = query.replace(/[,.?]/g, "").trim();

    // Dialogue acts are resolved before topical matching. They make one-word
    // replies meaningful without teaching every feature a separate "sim" rule.
    const affirmative = /^(?:sim|sim por favor|sim pode|pode|pode sim|claro|com certeza|quero|quero sim|isso|isso mesmo|faca isso|essa opcao|exato|exatamente|ok|okay|beleza|manda|vamos|bora|faca|faz|mostre|calcule|detalhe|entao faca|pode continuar|por favor|yes|yes please|sure|go ahead|please do|ja|bitte|si|claro que si|vale|dale)$/.test(command);
    const negative = /^(?:nao|nao obrigado|nao obrigada|agora nao|deixa|deixa pra la|cancela|cancelar|esquece|no|no thanks|not now|nein|nein danke|no gracias)$/.test(command);
    const repeat = /^(?:repita|repete|mande de novo|envie de novo|mostre novamente|nao apareceu|nao vi|repeat|send again|again|noch einmal|wiederholen|repite|otra vez)$/.test(command);
    const undo = /^(?:desfaca|desfaz|volte|volta|versao anterior|plano anterior|cardapio anterior|treino anterior|undo|go back|previous version|zuruck|vorherige version|deshacer|version anterior)$/.test(command);
    const correction = /^(?:na verdade|corrigindo|correcao|quis dizer|eu quis dizer|actually|correction|i meant|eigentlich|korrektur|quise decir|en realidad)\b/.test(command);
    const responseAct = affirmative ? "affirm" : negative ? "deny" : repeat ? "repeat" : undo ? "undo" : correction ? "correct" : null;

    const alternative = /^(?:por favor )?(?:outr[oa]|mais (?:um|uma)|outra opcao|faca outr[oa]|gere outr[oa]|quero (?:um|uma) diferente|pode variar|proxim[oa]|tente novamente|nao gostei faca outr[oa]|me de (?:um|uma) alternativa)(?: por favor)?$/.test(command)
      || /\b(outra estrategia|outra forma|outra alternativa|mais uma opcao|outra opcao|faca outra|gere outra)\b/.test(query);
    const explain = /\b(explique|explica|detalhe|detalha|aprofunde|aprofundar|por que|porque|como funciona|nao entendi|seja mais especifico|mostre como)\b/.test(query)
      || /^(?:como|por que|porque|e como|e por que)$/.test(command);
    const continueRequest = /^(?:continue|continuar|pode continuar|continue dai|siga|prossiga|e depois|depois disso|proximo passo|e agora|mais detalhes|faca um plano|o que mais|tem mais|e ai|then what|continue please|go on|weiter|und dann|continua|y despues)$/.test(command);

    const duration = query.match(/\b(15|20|25|30|35|40|45|50|60|75|90|120)\s*(?:min|minuto|minutos)\b/);
    const hourDuration = query.match(/\b(uma|1|1[.,]5|2)\s*(?:h|hora|horas)\b(?:\s*e\s*(15|30|45)\s*(?:min|minutos)?)?/);
    const durationMinutes = duration ? Number(duration[1]) : hourDuration ? Math.min(120, Math.round((hourDuration[1] === "uma" ? 1 : Number(hourDuration[1].replace(",", "."))) * 60 + Number(hourDuration[2] || 0))) : null;
    const swapOrdinal = query.match(/\b(?:troque|troca|substitua|substituir|retire)\s+(?:o\s+)?(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|\d)\b/);
    const ordinalMap = { primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3, quarto: 4, quarta: 4, quinto: 5, quinta: 5 };
    const ordinal = swapOrdinal ? (Number(swapOrdinal[1]) || ordinalMap[swapOrdinal[1]] || null) : null;

    const modifiers = {
      easier: /\b(mais facil|menos intenso|iniciante|simplifique|simplifica)\b/.test(query),
      harder: /\b(mais dificil|mais intenso|avancado|desafiante)\b/.test(query),
      shorter: /\b(mais curto|menos tempo|rapido)\b/.test(query),
      fuller: /\b(mais completo|complete mais|adicione mais)\b/.test(query),
      noEquipment: /\b(sem equipamento|peso do corpo|sem aparelhos)\b/.test(query),
      dumbbells: /\b(com halteres|so halteres|usando halteres)\b/.test(query),
      gym: /\b(para academia|na academia|com maquinas)\b/.test(query),
      home: /\b(para casa|em casa)\b/.test(query),
      durationMinutes,
      moreProtein: /\b(mais proteina|aumente a proteina|proteico|proteica)\b/.test(query),
      noWhey: /\b(sem whey|nao usar whey|sem usar whey)\b/.test(query),
      fourMeals: /\b(quatro|4) refeicoes\b|\bdivida.*(?:quatro|4)\b/.test(query),
      fewerCalories: /\b(menos calorias|reduza as calorias|mais leve)\b/.test(query),
      lactoseFree: /\b(sem lactose|retire o leite|sem leite)\b/.test(query),
      vegetarian: /\b(vegetarian[oa])\b/.test(query),
      vegan: /^(?:vegana?|versao vegana?)$|\b(adapte|deixe|torne|faca).*(?:vegana?|vegan)\b/.test(query),
      glutenFree: /\b(sem gluten|retire o gluten|gluten free)\b/.test(query),
      cheaper: /\b(mais barato|economico|economica|gastar menos)\b/.test(query),
      restDay: /\b(dia de descanso|dias de descanso|sem treino|nao treino)\b/.test(query),
      trainingDay: /\b(dia de treino|dias de treino)\b/.test(query),
      speed: /\b(foco em velocidade|mais velocidade|velocidade)\b/.test(query),
      sedentary: /\b(trabalha? sentad[oa]|rotina sedentaria|pessoa sedentaria)\b/.test(query),
      swapOrdinal: ordinal,
      keepRest: /\b(mantenha o restante|mantenha o resto|so troque)\b/.test(query)
    };
    const hasModifier = Object.values(modifiers).some(Boolean);

    const references = {
      calories: /\b(kcal|calorias?)\b/.test(query) && /\b(tem|total|isso|esse|essa|plano|cardapio|cada)\b/.test(query),
      protein: /\b(proteina)\b/.test(query) && (/\b(tem|total|isso|esse|essa|plano|cardapio|cada)\b/.test(query) || /^(?:e )?proteina$/.test(command)),
      duration: /\b(quanto tempo|duracao|demora quanto)\b/.test(query),
      frequency: /\b(quantas vezes|qual frequencia|todo dia|por semana)\b/.test(query),
      rest: /\b(quanto descanso|qual descanso|intervalo entre|tempo de descanso)\b/.test(query),
      images: /\b(foto|fotos|imagem|imagens|exemplo visual|como faz)\b/.test(query),
      substitution: /\b(posso trocar|posso substituir|substituir|substitua|trocar|troque|mude|no lugar|nao gosto)\b/.test(query),
      shopping: /\b(lista de compras|o que comprar|quais ingredientes)\b/.test(query),
      suitability: /\b(serve|funciona|adequad[oa]|bom|boa)\b.*\b(emagrecer|hipertrofia|ganhar massa|objetivo)\b/.test(query),
      games: /\b(com os jogos|dias de jogo|encaixo.*jogos|conciliar.*jogos)\b/.test(query)
    };
    const hasReference = Object.values(references).some(Boolean);

    let action = null;
    if (alternative) action = "alternative";
    else if (modifiers.swapOrdinal) action = "modify";
    else if (hasReference) action = "reference";
    else if (hasModifier) action = "modify";
    else if (explain) action = "explain";
    else if (continueRequest) action = "continue";

    const domainQuestion = !hasReference && /^(?:como|qual|quais|o que|por que)\b.*\b(performance esportiva|emagrecimento|hipertrofia|recuperacao|hidratacao|suplementacao|cardio|corrida|futebol|nutricao)\b/.test(query);
    const explicitNewRequest = !alternative && !continueRequest && (domainQuestion || /\b(monte|crie|gere|quero (?:um|uma)|preciso de|calcule minhas|quanto devo|quanta preciso)\b/.test(query));
    return { query, command, action, responseAct, modifiers, references, explicitNewRequest };
  }

  window.FitnessDialogueEngine = { analyze, normalize };
})();

