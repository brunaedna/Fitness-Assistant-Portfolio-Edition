/*
 * Structured offline catalog for the prototype.
 * Eight public topics expose exactly 2,500 individually addressable records each.
 * Records are generated from reviewed dimensions instead of copying 20,000 nearly
 * identical answers into the bundle. The engine retrieves a record, then composes
 * a response with the current visitor profile.
 */
(function () {
  "use strict";

  const normalize = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokenize = value => [...new Set(normalize(value).match(/[a-z0-9]+/g) || [])].filter(token => token.length > 2);

  const contextSets = {
    training: [
      "em casa sem equipamentos", "na academia com máquinas", "com halteres", "com elásticos", "para uma pessoa iniciante",
      "para uma pessoa intermediária", "para uma pessoa avançada", "na volta após uma pausa", "em apenas 20 minutos", "em aproximadamente 30 minutos",
      "em aproximadamente 45 minutos", "em aproximadamente 60 minutos", "treinando 2 dias por semana", "treinando 3 dias por semana", "treinando 4 dias por semana",
      "treinando 5 dias por semana", "para quem tem rotina sedentária", "para quem trabalha em atividade física", "treinando pela manhã", "treinando à noite",
      "durante uma viagem", "em um espaço pequeno", "com foco principal em técnica", "com foco em progressão gradual", "com prioridade para segurança e recuperação"
    ],
    nutrition: [
      "com orçamento reduzido", "com pouco tempo para cozinhar", "preparando refeições para a semana", "comendo frequentemente fora de casa", "cozinhando em casa",
      "levando refeições para o trabalho", "durante uma viagem", "seguindo alimentação vegetariana", "seguindo alimentação vegana", "sem consumir lactose",
      "preferindo refeições sem glúten", "sentindo muita fome", "com pouco apetite", "treinando pela manhã", "treinando à noite",
      "nos dias de descanso", "nos dias de treino", "com objetivo de emagrecimento", "com objetivo de hipertrofia", "em fase de manutenção",
      "fazendo 3 refeições por dia", "fazendo 4 refeições por dia", "fazendo 5 refeições por dia", "organizando o fim de semana", "com foco em segurança e consistência"
    ],
    behavior: [
      "com uma rotina muito corrida", "trabalhando sentada", "trabalhando em turnos", "dormindo pouco", "em semanas de muito estresse",
      "durante o fim de semana", "em festas e encontros sociais", "comendo frequentemente fora", "com orçamento reduzido", "sem apoio de outras pessoas",
      "começando do zero", "retomando após uma pausa", "depois de um dia fora do plano", "enfrentando um platô", "com fome maior à noite",
      "com vontade de doces", "com vontade de alimentos salgados", "com pouco tempo para treinar", "com pouco tempo para cozinhar", "durante viagens",
      "acompanhando o peso semanal", "usando medidas e fotos de progresso", "criando hábitos pequenos", "evitando restrições extremas", "com foco em saúde e constância"
    ],
    sport: [
      "para uma pessoa iniciante", "para uma pessoa intermediária", "para uma pessoa avançada", "na pré-temporada", "durante a temporada",
      "na volta após uma pausa", "com 2 sessões semanais", "com 3 sessões semanais", "com pouco tempo disponível", "com academia disponível",
      "sem acesso à academia", "com halteres e elásticos", "em casa", "ao ar livre", "com foco em velocidade",
      "com foco em potência", "com foco em resistência", "com foco em agilidade", "com foco em técnica", "com foco em força",
      "conciliando treinos e jogos", "antes de uma competição", "após uma competição", "controlando a carga semanal", "priorizando recuperação e prevenção"
    ]
  };

  const CONTEXT_COUNT = 25;
  const FOCUS_COUNT = 10;

  const definitions = [
    {
      id: "weight-loss",
      label: "Emagrecimento",
      triggers: ["emagrecer", "perder peso", "perder gordura", "deficit", "secar", "weight loss", "lose fat"],
      intents: ["Como começar a emagrecer", "Como criar um plano para perder gordura", "Como preservar massa magra", "Como superar um platô", "Como organizar a semana", "Como controlar as porções", "Como aumentar o gasto diário", "Como acompanhar o progresso", "Como emagrecer sem dieta radical", "Como manter o resultado"],
      focuses: ["déficit moderado", "musculação", "passos diários", "refeições saciantes", "sono", "fim de semana", "consistência", "monitoramento do peso", "manutenção muscular", "mudança de hábitos"],
      contexts: contextSets.behavior
    },
    {
      id: "muscle-building",
      label: "Hipertrofia",
      triggers: ["hipertrofia", "ganhar massa", "crescer musculo", "muscle building", "build muscle", "massa muscular"],
      intents: ["Monte um treino de hipertrofia", "Como desenvolver", "Crie uma sessão para", "Como aumentar o volume de", "Como progredir o treino de", "Quais exercícios usar para", "Como dividir o treino de", "Como recuperar melhor", "Como trabalhar duas vezes por semana", "Como evitar estagnação em"],
      focuses: ["pernas", "glúteos", "peito", "costas", "ombros", "bíceps", "tríceps", "panturrilhas", "posteriores de coxa", "corpo inteiro"],
      contexts: contextSets.training
    },
    {
      id: "protein",
      label: "Proteína",
      triggers: ["proteina", "protein", "whey", "aminoacido", "massa magra"],
      intents: ["Quanta proteína consumir", "Como distribuir proteína", "Quais fontes usar", "Como atingir a meta", "Preciso de whey", "Proteína muda no descanso", "Como montar refeições proteicas", "Proteína vegetal funciona", "Como calcular por quilo", "Quando consumir proteína"],
      focuses: ["emagrecimento", "hipertrofia", "manutenção", "corrida", "futebol", "dieta vegetariana", "dieta sem lactose", "baixo orçamento", "pouco apetite", "rotina corrida"],
      contexts: contextSets.nutrition
    },
    {
      id: "chest",
      label: "Peito",
      triggers: ["peito", "peitoral", "supino", "chest", "bench press"],
      intents: ["Monte um treino de peito", "Como melhorar o supino", "Como desenvolver o peitoral", "Crie uma sessão curta de peito", "Como progredir cargas no peito", "Quais exercícios usar para peito", "Como treinar peito duas vezes", "Como sentir melhor o peitoral", "Como variar o treino de peito", "Como organizar peito e tríceps"],
      focuses: ["força", "hipertrofia", "parte superior", "parte média", "controle técnico", "amplitude", "estabilidade", "halteres", "máquinas", "peso corporal"],
      contexts: contextSets.training
    },
    {
      id: "food",
      label: "Nutrição",
      triggers: ["nutricao", "alimentacao", "alimentar", "estrutura alimentar", "dieta", "comida", "refeicao", "cardapio", "vegetariano", "vegetariana", "vegano", "vegana", "o que comer", "food", "meal"],
      intents: ["Monte uma estrutura alimentar", "Como organizar as refeições", "Dê um exemplo de cardápio", "Como preparar comida para a semana", "Como comer melhor", "Como ajustar porções", "Como escolher lanches", "Como montar o prato", "Como comer bem gastando pouco", "Como adaptar a alimentação"],
      focuses: ["equilibrada", "mediterrânea", "vegetariana", "vegana", "sem lactose", "comida brasileira", "alta em fibras", "rica em proteína", "para dias de treino", "para dias de descanso"],
      contexts: contextSets.nutrition
    },
    {
      id: "cravings",
      label: "Controle de vontades",
      triggers: ["vontade de doce", "compulsao", "beliscar", "fome emocional", "craving", "antojo"],
      intents: ["Como controlar a vontade", "O que fazer quando surgir vontade", "Como evitar beliscar", "Como planejar uma alternativa", "Como diferenciar fome e vontade", "Como reduzir gatilhos", "Como lidar sem proibir alimentos", "Como melhorar saciedade", "Como organizar o ambiente", "Como retomar após exagerar"],
      focuses: ["doces", "salgadinhos", "comida à noite", "fim de semana", "estresse", "tédio", "pouco sono", "restrição excessiva", "refeições pequenas", "alimentos disponíveis em casa"],
      contexts: contextSets.behavior
    },
    {
      id: "gym",
      label: "Academia",
      triggers: ["academia", "gym", "aparelhos", "primeiro treino", "iniciante"],
      intents: ["Monte uma rotina de academia", "Como começar na academia", "Crie uma divisão semanal", "Como aprender os aparelhos", "Como escolher as cargas", "Como progredir na academia", "Como voltar depois de parar", "Como treinar com pouco tempo", "Como organizar séries e descansos", "Como registrar a evolução"],
      focuses: ["corpo inteiro", "superior e inferior", "empurrar e puxar", "pernas", "máquinas", "pesos livres", "força", "hipertrofia", "condicionamento", "técnica"],
      contexts: contextSets.training
    },
    {
      id: "sport",
      label: "Esporte",
      triggers: ["esporte", "performance", "futebol", "corrida", "volei", "basquete", "tenis", "sport"],
      intents: ["Monte uma sessão para melhorar", "Como desenvolver", "Crie um treino complementar para", "Como aumentar", "Como organizar a preparação de", "Quais exercícios ajudam", "Como conciliar musculação com", "Como recuperar melhor em", "Como prevenir excesso de carga em", "Como medir evolução em"],
      focuses: ["futebol", "corrida", "basquete", "vôlei", "tênis", "ciclismo", "natação", "lutas", "handebol", "corrida de obstáculos"],
      contexts: contextSets.sport
    }
  ];

  function makeRecords(definition) {
    const records = [];
    definition.intents.forEach((intent, intentIndex) => {
      definition.focuses.forEach((focus, focusIndex) => {
        definition.contexts.forEach((context, contextIndex) => {
          const sequence = intentIndex * FOCUS_COUNT * CONTEXT_COUNT + focusIndex * CONTEXT_COUNT + contextIndex + 1;
          const question = `${intent} ${focus}, ${context}?`;
          records.push({
            id: `${definition.id}-${String(sequence).padStart(4, "0")}`,
            topic: definition.id,
            sequence,
            intent,
            focus,
            context,
            question,
            tokens: tokenize(question)
          });
        });
      });
    });
    return records;
  }

  const catalogs = Object.fromEntries(definitions.map(definition => [definition.id, makeRecords(definition)]));

  function profileLine(profile, language) {
    if (!profile) return "";
    const parts = [];
    if (profile.age) parts.push(language === "pt" ? `${profile.age} anos` : `age ${profile.age}`);
    if (profile.weightKg) parts.push(`${profile.weightKg} kg`);
    if (profile.heightCm) parts.push(`${profile.heightCm} cm`);
    if (profile.activity) parts.push(language === "pt" && profile.activity === "sedentary" ? "rotina sedentária" : profile.activity);
    if (!parts.length) return "";
    return language === "pt" ? `Considerei seu perfil registrado (${parts.join(", ")}).\n\n` : `I considered your saved profile (${parts.join(", ")}).\n\n`;
  }

  function rotate(list, seed, count) {
    return Array.from({ length: count }, (_, index) => list[(seed + index) % list.length]);
  }

  const exercises = {
    "pernas": ["agachamento", "leg press", "afundo reverso", "cadeira extensora", "elevação de panturrilhas", "step-up"],
    "glúteos": ["hip thrust", "agachamento búlgaro", "levantamento romeno", "abdução de quadril", "passada", "ponte de glúteos"],
    "peito": ["supino reto", "supino inclinado", "crossover", "flexão", "crucifixo com halteres", "chest press"],
    "costas": ["puxada frontal", "remada baixa", "remada unilateral", "pulldown", "face pull", "pullover no cabo"],
    "ombros": ["desenvolvimento", "elevação lateral", "crucifixo inverso", "elevação frontal", "face pull", "desenvolvimento unilateral"],
    "bíceps": ["rosca direta", "rosca alternada", "rosca martelo", "rosca Scott", "rosca no cabo", "rosca inclinada"],
    "tríceps": ["tríceps na polia", "tríceps francês", "supino fechado", "extensão acima da cabeça", "mergulho assistido", "tríceps unilateral"],
    "panturrilhas": ["panturrilha em pé", "panturrilha sentada", "panturrilha unilateral", "panturrilha no leg press", "isometria na ponta dos pés", "saltitos leves"],
    "posteriores de coxa": ["levantamento romeno", "mesa flexora", "flexora sentada", "bom-dia", "nórdico assistido", "ponte com pés afastados"],
    "corpo inteiro": ["agachamento", "supino", "remada", "levantamento romeno", "desenvolvimento", "prancha"]
  };

  const bodyweightExercises = {
    "pernas": ["agachamento para cadeira", "afundo reverso com apoio", "step-up em degrau", "ponte de glúteos", "wall sit", "panturrilha unilateral"],
    "glúteos": ["ponte de glúteos", "agachamento búlgaro com apoio", "extensão de quadril em quatro apoios", "abdução lateral deitada", "passada", "ponte unilateral"],
    "peito": ["flexão na parede", "flexão inclinada", "flexão com joelhos apoiados", "flexão tradicional", "flexão com pausa", "isometria de palmas"],
    "costas": ["remada isométrica com toalha", "anjo reverso no chão", "elevação Y-T-W", "superman com puxada", "prancha reversa", "retração escapular deitada"],
    "ombros": ["flexão pike assistida", "elevação lateral isométrica", "prancha com toque no ombro", "anjo na parede", "flexão escapular", "isometria acima da cabeça"],
    "bíceps": ["rosca com resistência da outra mão", "rosca isométrica com toalha", "rosca auto-resistida", "prancha reversa", "sustentação isométrica", "rosca com mochila opcional"],
    "tríceps": ["flexão fechada na parede", "extensão de tríceps na parede", "flexão com mãos próximas", "mergulho em cadeira estável", "prancha alta", "extensão auto-resistida"],
    "panturrilhas": ["panturrilha em pé", "panturrilha unilateral com apoio", "isometria na ponta dos pés", "panturrilha com joelhos flexionados", "caminhada na ponta dos pés", "saltitos leves"],
    "posteriores de coxa": ["bom-dia sem carga", "ponte com pés afastados", "deslizamento de calcanhar", "ponte unilateral", "nórdico assistido", "elevação pélvica"],
    "corpo inteiro": ["agachamento para cadeira", "flexão inclinada", "remada isométrica com toalha", "ponte de glúteos", "flexão pike assistida", "prancha"]
  };

  const dumbbellExercises = {
    "pernas": ["agachamento goblet", "levantamento romeno com halteres", "afundo reverso com halteres", "step-up com halteres", "agachamento sumô", "panturrilha com halteres"],
    "glúteos": ["hip thrust com halter", "agachamento búlgaro com halteres", "levantamento romeno", "passada com halteres", "ponte com halter", "step-up"],
    "peito": ["supino com halteres", "supino inclinado com halteres", "crucifixo com halteres", "flexão", "squeeze press", "pullover com halter"],
    "costas": ["remada unilateral", "remada curvada com halteres", "pullover com halter", "crucifixo inverso", "remada apoiada", "encolhimento"],
    "ombros": ["desenvolvimento com halteres", "elevação lateral", "crucifixo inverso", "elevação frontal", "desenvolvimento unilateral", "elevação lateral inclinada"],
    "bíceps": ["rosca alternada", "rosca martelo", "rosca inclinada", "rosca concentrada", "rosca simultânea", "rosca cruzada"],
    "tríceps": ["tríceps francês com halter", "tríceps testa com halteres", "supino fechado com halteres", "coice", "extensão unilateral", "flexão fechada"],
    "panturrilhas": ["panturrilha em pé com halteres", "panturrilha unilateral", "panturrilha sentada com halter", "isometria na ponta dos pés", "caminhada na ponta dos pés", "saltitos leves"],
    "posteriores de coxa": ["levantamento romeno com halteres", "bom-dia com halter", "ponte com halter", "romeno unilateral", "ponte unilateral", "deslizamento de calcanhar"],
    "corpo inteiro": ["agachamento goblet", "supino com halteres", "remada unilateral", "levantamento romeno", "desenvolvimento com halteres", "prancha com arrasto"]
  };

  function composeWorkout(record, profile) {
    const muscleFocus = record.topic === "chest" ? "peito" : record.focus;
    const context = normalize(record.context);
    const equipment = profile?.equipment || (/sem equipamentos/.test(context) ? "bodyweight" : /halteres/.test(context) ? "dumbbells" : /academia|maquinas/.test(context) ? "gym" : null);
    const source = equipment === "bodyweight" ? bodyweightExercises : equipment === "dumbbells" ? dumbbellExercises : exercises;
    const pool = source[muscleFocus] || source["corpo inteiro"];
    const duration = Number(profile?.durationMinutes) || null;
    const exerciseCount = duration && duration <= 25 ? 3 : duration && duration <= 35 ? 4 : 5;
    const chosen = rotate(pool, record.sequence, exerciseCount);
    const beginner = profile?.experience === "beginner" || record.context.includes("iniciante");
    const intentIndex = Math.floor((record.sequence - 1) / (FOCUS_COUNT * CONTEXT_COUNT));
    const contextIndex = (record.sequence - 1) % CONTEXT_COUNT;
    const sets = beginner || (duration && duration <= 25) ? 2 : 3 + (intentIndex % 2);
    const mainRanges = ["5–8", "6–10", "8–12", "10–12", "6–8"];
    const accessoryRanges = ["10–15", "12–18", "8–12", "12–20", "10–12"];
    const restMain = [150, 120, 90, 105, 135][contextIndex % 5];
    const lines = chosen.map((exercise, index) => `${index + 1}. ${exercise} — ${sets}×${index < 2 ? mainRanges[intentIndex % 5] : accessoryRanges[contextIndex % 5]}`);
    const emphasis = record.topic === "chest" ? `, ênfase em ${record.focus}` : "";
    const equipmentLabel = equipment === "bodyweight" ? "peso corporal, sem aparelhos" : equipment === "dumbbells" ? "halteres" : equipment === "gym" ? "academia" : record.context;
    return `Plano ${record.id} · ${muscleFocus}${emphasis}\nObjetivo: ${record.intent.toLowerCase()} · contexto: ${equipmentLabel}${duration ? ` · duração alvo: ${duration} minutos` : ""}.\n${lines.join("\n")}\n\nDescanse cerca de ${restMain} s nos dois primeiros movimentos e 60–90 s nos demais. Termine com 1–3 repetições em reserva. Quando alcançar o topo da faixa em todas as séries com técnica estável, aumente a carga gradualmente.`;
  }

  function composeProtein(record, profile) {
    if (!profile?.weightKg) {
      return `Cenário ${record.id} · ${record.intent.toLowerCase()} para ${record.focus}, ${record.context}. Para calcular uma faixa pessoal, informe seu peso em kg. Como estrutura geral, distribua proteína em 3–5 refeições e priorize alimentos que se encaixem na sua rotina; whey é opcional.`;
    }
    const lowerFactor = profile.goal === "muscle" ? 1.7 : 1.6;
    const upperFactor = 2.2;
    const low = Math.round(profile.weightKg * lowerFactor);
    const high = Math.round(profile.weightKg * upperFactor);
    const perMealLow = Math.round(low / 4);
    const perMealHigh = Math.round(high / 4);
    return `Cenário ${record.id} · ${record.intent.toLowerCase()} para ${record.focus}, ${record.context}. Com ${profile.weightKg} kg, uma faixa prática para quem treina é aproximadamente ${low}–${high} g/dia. Em quatro refeições, isso representa cerca de ${perMealLow}–${perMealHigh} g por refeição. O total diário importa mais que um horário perfeito; ajuste com nutricionista se houver doença renal, gestação ou condição clínica.`;
  }

  function foodPlanData(record, profile = {}) {
    const offset = record.sequence - 1;
    const intentIndex = Math.floor(offset / (FOCUS_COUNT * CONTEXT_COUNT));
    const focusIndex = Math.floor((offset % (FOCUS_COUNT * CONTEXT_COUNT)) / CONTEXT_COUNT);
    const contextIndex = offset % CONTEXT_COUNT;
    const breakfasts = ["omelete, pão integral e mamão", "iogurte, aveia e banana", "tofu mexido, tapioca e fruta", "mingau de aveia com leite e sementes", "pão com ricota e fruta", "cuscuz com ovos e tomate", "vitamina de iogurte, fruta e aveia", "overnight oats com chia", "panqueca de banana e ovos", "feijão, arroz e ovos em porção leve"];
    const mainMeals = ["arroz, feijão, frango e salada", "batata, peixe e legumes", "massa, carne magra e vegetais", "arroz integral, tofu e legumes", "quinoa, lentilha e vegetais", "mandioca, ovos e salada", "arroz, grão-de-bico e abóbora", "polenta, frango e folhas", "batata-doce, carne e brócolis", "arroz, feijão, sardinha e couve"];
    const snacks = ["iogurte com fruta", "fruta com castanhas", "pão com queijo", "hummus com legumes", "leite com aveia", "ovo cozido com fruta", "sanduíche de frango", "tofu grelhado com fruta", "iogurte vegetal com sementes", "pipoca caseira e iogurte"];
    const planning = ["prepare duas bases no fim de semana", "use alimentos congelados e porções simples", "repita refeições práticas nos dias corridos", "leve um lanche planejado", "deixe uma opção rápida pronta para depois do treino"];
    const dietaryContext = normalize(`${record.focus} ${record.context}`);
    const vegan = /vegan/.test(dietaryContext) || profile.dietNotes?.includes("vegan");
    const vegetarian = vegan || /vegetarian/.test(dietaryContext) || profile.dietNotes?.includes("vegetarian");
    const lactoseFree = /sem lactose/.test(dietaryContext) || profile.dietNotes?.includes("lactose-free") || profile.allergies?.includes("milk");
    let breakfast = breakfasts[intentIndex];
    let mainMeal = mainMeals[focusIndex];
    let snack = snacks[(intentIndex + focusIndex + contextIndex) % snacks.length];
    let otherMeal = "metade do prato com vegetais, uma fonte de proteína e carboidrato ajustado à atividade";
    if (vegan) {
      breakfast = ["tofu mexido, pão integral e mamão", "mingau de aveia com bebida de soja e banana", "cuscuz com grão-de-bico e tomate"][intentIndex % 3];
      mainMeal = ["arroz, feijão, tofu e salada", "batata, lentilha e legumes", "massa, grão-de-bico e vegetais"][focusIndex % 3];
      snack = ["iogurte vegetal com sementes", "fruta com castanhas", "hummus com legumes"][contextIndex % 3];
      otherMeal = "vegetais, tofu ou leguminosas e carboidrato ajustado à atividade";
    } else if (vegetarian) {
      breakfast = ["omelete, pão integral e mamão", "iogurte, aveia e banana", "tofu mexido, tapioca e fruta"][intentIndex % 3];
      mainMeal = ["arroz, feijão, ovos e salada", "batata, tofu e legumes", "massa, lentilha e vegetais"][focusIndex % 3];
      snack = ["iogurte com fruta", "fruta com castanhas", "hummus com legumes"][contextIndex % 3];
      otherMeal = "vegetais, ovos, tofu ou leguminosas e carboidrato ajustado à atividade";
    } else if (lactoseFree) {
      breakfast = breakfast.replace(/iogurte|leite|ricota/gi, "alternativa sem lactose");
      snack = snack.replace(/iogurte|leite|queijo/gi, "alternativa sem lactose");
    }
    const allergies = new Set(Array.isArray(profile.allergies) ? profile.allergies : []);
    const adaptAllergens = value => {
      let next = value;
      if (allergies.has("egg")) next = next.replace(/panqueca de banana e ovos|omelete|ovos?/gi, "tofu ou leguminosas");
      if (allergies.has("milk")) next = next.replace(/iogurte(?: vegetal)?|leite|ricota|queijo/gi, "alternativa vegetal sem leite");
      if (allergies.has("fish")) next = next.replace(/peixe|sardinha/gi, "tofu ou leguminosas");
      if (allergies.has("soy")) next = next.replace(/tofu|bebida de soja|iogurte vegetal/gi, "lentilha ou grão-de-bico sem soja");
      if (allergies.has("peanut")) next = next.replace(/amendoim/gi, "sementes permitidas");
      if (allergies.has("gluten")) next = next.replace(/pão integral|pão|massa/gi, match => /massa/i.test(match) ? "arroz" : "tapioca").replace(/aveia/gi, "aveia certificada sem glúten");
      return next;
    };
    breakfast = adaptAllergens(breakfast);
    mainMeal = adaptAllergens(mainMeal);
    snack = adaptAllergens(snack);
    otherMeal = adaptAllergens(otherMeal);
    otherMeal = otherMeal
      .replace(/tofu ou leguminosas,\s*tofu ou leguminosas/gi, "tofu ou leguminosas")
      .replace(/lentilha ou grão-de-bico sem soja\s+ou leguminosas/gi, "lentilha ou grão-de-bico sem soja");
    const calorieCenters = {
      breakfast: 330 + (intentIndex % 5) * 25,
      mainMeal: 520 + (focusIndex % 5) * 35,
      snack: 170 + ((intentIndex + focusIndex + contextIndex) % 5) * 20,
      otherMeal: 450 + (contextIndex % 5) * 30
    };
    const totalCenter = Object.values(calorieCenters).reduce((sum, value) => sum + value, 0);
    const round50 = value => Math.round(value / 50) * 50;
    const highProtein = /rica em proteina|dias de treino|hipertrofia/.test(normalize(`${record.focus} ${record.context}`));
    return {
      type: "food-plan",
      recordId: record.id,
      focus: record.focus,
      context: record.context,
      breakfast,
      mainMeal,
      snack,
      otherMeal,
      planning: planning[contextIndex % planning.length],
      restrictions: [vegan ? "vegana" : vegetarian ? "vegetariana" : null, lactoseFree ? "sem leite/lactose" : null, ...[...allergies].map(item => `alergia: ${item}`)].filter(Boolean),
      calories: {
        low: round50(totalCenter * 0.85),
        high: round50(totalCenter * 1.15),
        meals: {
          breakfast: [round50(calorieCenters.breakfast * 0.85), round50(calorieCenters.breakfast * 1.15)],
          mainMeal: [round50(calorieCenters.mainMeal * 0.85), round50(calorieCenters.mainMeal * 1.15)],
          snack: [round50(calorieCenters.snack * 0.85), round50(calorieCenters.snack * 1.15)],
          otherMeal: [round50(calorieCenters.otherMeal * 0.85), round50(calorieCenters.otherMeal * 1.15)]
        }
      },
      protein: highProtein ? { low: 90, high: 125 } : { low: 70, high: 105 }
    };
  }

  function composeFood(record, profile) {
    const plan = foodPlanData(record, profile);
    return `Estrutura alimentar ${record.id} · ${record.focus}\nObjetivo: ${record.intent.toLowerCase()} · contexto: ${record.context}.\n• Café da manhã: ${plan.breakfast}.\n• Refeição principal: ${plan.mainMeal}.\n• Lanche: ${plan.snack}.\n• Organização: ${plan.planning}.\n• Outra refeição: ${plan.otherMeal}.${plan.restrictions.length ? `\n• Restrições consideradas: ${plan.restrictions.join(", ")}.` : ""}\n\nEsta é uma das 2.500 estruturas educativas do catálogo, não uma prescrição clínica. As porções dependem de objetivo, fome, treino, preferências e condições de saúde.`;
  }

  function composeAnswer(record, language, profile) {
    if (language !== "pt") return null;
    const prefix = profileLine(profile, language);
    if (record.topic === "muscle-building" || record.topic === "chest" || record.topic === "gym") {
      return prefix + composeWorkout(record, profile);
    }
    if (record.topic === "protein") return prefix + composeProtein(record, profile);
    if (record.topic === "food") return prefix + composeFood(record, profile);
    if (record.topic === "weight-loss") {
      return `${prefix}Estratégia ${record.id} · ${record.focus}\nObjetivo: ${record.intent.toLowerCase()} · contexto: ${record.context}.\n1. Use um déficit moderado, sem cortar grupos alimentares inteiros.\n2. Preserve musculação e proteína suficiente.\n3. Acompanhe a média semanal do peso, cintura, energia e desempenho.\n4. Mude apenas uma variável após 2–3 semanas sem tendência de progresso.\n\nComece com a menor mudança que consiga repetir. Metas muito agressivas aumentam a chance de perda muscular e abandono.`;
    }
    if (record.topic === "cravings") {
      return `${prefix}Protocolo ${record.id} · foco: ${record.focus}\nObjetivo: ${record.intent.toLowerCase()} · contexto: ${record.context}.\n1. Verifique fome física, horário da última refeição e emoção presente.\n2. Faça uma refeição ou lanche com proteína, fibra e volume.\n3. Se ainda quiser o alimento, sirva uma porção planejada e coma sem distrações.\n4. Registre o gatilho para ajustar ambiente, sono ou rotina.\n\nPerda frequente de controle, culpa ou compensação merece apoio de nutricionista e psicólogo.`;
    }
    if (record.topic === "sport") {
      return `${prefix}Sessão ${record.id} · ${record.focus}\nObjetivo: ${record.intent.toLowerCase()} · contexto: ${record.context}.\n• Aquecimento dinâmico: 8–10 min.\n• Técnica específica: 4 blocos curtos com descanso suficiente.\n• Força/potência: 3 exercícios, 3×4–8.\n• Condicionamento específico: 6–10 esforços de qualidade.\n• Volta à calma: 5 min.\n\nColoque técnica e velocidade antes da fadiga. Ajuste o volume ao calendário do esporte e mantenha pelo menos um dia leve após sessões intensas.`;
    }
    return null;
  }

  function topicScore(definition, query) {
    return definition.triggers.reduce((score, trigger) => score + (query.includes(normalize(trigger)) ? 4 + tokenize(trigger).length : 0), 0);
  }

  function recordScore(record, queryTokens) {
    return record.tokens.reduce((score, token) => score + (queryTokens.includes(token) ? 1 : 0), 0);
  }

  function profileContext(profile) {
    if (!profile) return "";
    const parts = [];
    if (profile.experience === "beginner") parts.push("para uma pessoa iniciante");
    if (profile.experience === "intermediate") parts.push("para uma pessoa intermediária");
    if (profile.experience === "advanced") parts.push("para uma pessoa avançada");
    if (profile.equipment === "bodyweight") parts.push("em casa sem equipamentos");
    if (profile.equipment === "dumbbells") parts.push("com halteres");
    if (profile.equipment === "gym") parts.push("na academia com máquinas");
    if (profile.activity === "sedentary") parts.push("rotina sedentária");
    if (profile.goal === "loss") parts.push("emagrecimento déficit moderado");
    if (profile.goal === "muscle") parts.push("hipertrofia ganhar massa");
    if (profile.primarySport) parts.push(profile.primarySport === "football" ? "futebol" : profile.primarySport);
    if (profile.durationMinutes) parts.push(`${profile.durationMinutes} minutos`);
    if (profile.dietNotes?.includes("vegan")) parts.push("alimentação vegana");
    else if (profile.dietNotes?.includes("vegetarian")) parts.push("alimentação vegetariana");
    if (profile.dietNotes?.includes("lactose-free")) parts.push("sem lactose");
    if (profile.dietNotes?.includes("frequent-junk-food")) parts.push("refeições saciantes e práticas");
    return parts.join(" ");
  }

  function artifactFor(record, profile) {
    const typeMap = {
      "weight-loss": "weight-loss-plan",
      "muscle-building": "workout",
      protein: "protein-plan",
      chest: "workout",
      food: "food-plan",
      cravings: "cravings-plan",
      gym: "workout",
      sport: "sport-session"
    };
    return {
      ...(record.topic === "food" ? foodPlanData(record, profile) : {}),
      type: typeMap[record.topic] || "catalog-result",
      topic: record.topic,
      recordId: record.id,
      focus: record.focus,
      context: record.context,
      intent: record.intent,
      sequence: record.sequence
    };
  }

  function resultFor(record, language, profile) {
    const textResponse = composeAnswer(record, language, profile);
    if (!textResponse) return null;
    return {
      topic: record.topic,
      recordId: record.id,
      text: textResponse,
      artifact: artifactFor(record, profile)
    };
  }

  function answer({ text, language = "pt", profile }) {
    const query = normalize(text);
    const rankedTopics = definitions
      .map(definition => ({ definition, score: topicScore(definition, query) }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score);
    const selectedTopic = rankedTopics[0]?.definition;
    if (!selectedTopic) return null;

    const queryTokens = tokenize(`${query} ${profileContext(profile)}`);
    const record = catalogs[selectedTopic.id]
      .map(item => ({ item, score: recordScore(item, queryTokens) }))
      .sort((a, b) => b.score - a.score || a.item.sequence - b.item.sequence)[0].item;
    return resultFor(record, language, profile);
  }

  function selectNext({ topicId, currentRecordId, recentRecordIds = [], query = "", language = "pt", profile, previousArtifact }) {
    const records = catalogs[topicId];
    if (!records?.length) return null;
    const recent = new Set(recentRecordIds);
    if (currentRecordId) recent.add(currentRecordId);
    const currentIndex = currentRecordId ? records.findIndex(record => record.id === currentRecordId) : -1;
    const queryTokens = tokenize(`${query} ${profileContext(profile)}`).filter(token => !["outra", "outro", "mais", "opcao", "favor", "faca", "gere"].includes(token));

    let candidates = records.filter(record => !recent.has(record.id));
    if (!candidates.length) candidates = records.filter(record => record.id !== currentRecordId);
    if (!candidates.length) candidates = records;

    let record;
    if (!queryTokens.length) {
      record = records[(currentIndex + 1 + records.length) % records.length];
      if (recent.has(record.id)) record = candidates[0];
    } else {
      record = candidates
        .map(item => ({
          item,
          score: recordScore(item, queryTokens) * 10
            + (previousArtifact?.focus === item.focus ? 4 : 0)
            + (previousArtifact?.intent === item.intent ? 2 : 0)
        }))
        .sort((a, b) => b.score - a.score || Math.abs(a.item.sequence - (previousArtifact?.sequence || 1)) - Math.abs(b.item.sequence - (previousArtifact?.sequence || 1)))[0].item;
    }
    return resultFor(record, language, profile);
  }

  function stats() {
    return Object.fromEntries(definitions.map(definition => [definition.id, catalogs[definition.id].length]));
  }

  const counts = Object.values(stats());
  if (counts.length !== 8 || counts.some(count => count !== 2500)) {
    throw new Error("Fitness catalog must contain exactly 2,500 records in each of 8 topics.");
  }

  window.FitnessCatalogEngine = {
    answer,
    selectNext,
    stats,
    topics: definitions.map(definition => ({ id: definition.id, label: definition.label })),
    getRecord(topicId, sequence) {
      return catalogs[topicId]?.[Number(sequence) - 1] || null;
    }
  };
})();

