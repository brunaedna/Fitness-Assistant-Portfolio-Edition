/*
 * Offline fitness knowledge engine for the prototype.
 * It performs concept retrieval and contextual response composition without an API.
 * Baseline guidance is calibrated from WHO physical-activity guidance, ACSM position
 * stands, and ISSN position stands. It is educational and not a medical diagnosis.
 */
(function () {
  "use strict";

  const normalize = value => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const topics = [
    {
      id: "physical-activity",
      terms: ["atividade fisica", "quanto exercicio", "ser mais ativo", "sedentario", "health exercise", "physical activity", "bewegung", "actividad fisica"],
      answers: {
        pt: "Para saúde geral, uma referência útil para adultos é acumular 150–300 minutos semanais de atividade aeróbica moderada, ou 75–150 minutos vigorosos, além de fortalecimento dos grandes grupos musculares em pelo menos 2 dias. Se você está sedentária, não precisa começar nesse volume: 10–20 minutos de caminhada e 2 treinos curtos por semana já são um ponto de partida; aumente gradualmente.",
        en: "For general health, adults can aim for 150–300 weekly minutes of moderate aerobic activity, or 75–150 vigorous minutes, plus major-muscle strengthening on at least 2 days. If you are sedentary, begin with 10–20 minute walks and two short strength sessions, then build gradually.",
        de: "Für die allgemeine Gesundheit gelten 150–300 Minuten moderate oder 75–150 Minuten intensive Ausdaueraktivität pro Woche plus Krafttraining an mindestens 2 Tagen als Orientierung. Bei sitzendem Alltag klein anfangen und schrittweise steigern.",
        es: "Para la salud general, una referencia es 150–300 minutos semanales de actividad aeróbica moderada, o 75–150 vigorosos, más fuerza al menos 2 días. Si eres sedentaria, empieza con sesiones cortas y aumenta gradualmente."
      }
    },
    {
      id: "hypertrophy",
      terms: ["hipertrofia", "crescer musculo", "ganhar massa", "massa muscular", "muscle growth", "build muscle", "muskelaufbau", "ganar musculo"],
      answers: {
        pt: "Hipertrofia depende principalmente de treino com esforço suficiente, progressão ao longo das semanas, volume recuperável, proteína e energia adequadas. Treine cada grupo muscular cerca de 2 vezes por semana, use majoritariamente séries de 6–15 repetições e termine muitas delas com 1–3 repetições em reserva. Quando alcançar o topo da faixa com boa técnica, aumente um pouco a carga ou as repetições.",
        en: "Hypertrophy mainly depends on sufficiently hard training, progressive overload, recoverable volume, adequate protein, and enough energy. Train each muscle roughly twice weekly, use mostly 6–15 reps, and finish many sets with 1–3 reps in reserve.",
        de: "Muskelaufbau braucht ausreichend intensives Training, progressive Steigerung, erholbares Volumen, genug Protein und Energie. Trainiere jede Muskelgruppe ungefähr zweimal pro Woche und lass oft 1–3 Wiederholungen in Reserve.",
        es: "La hipertrofia depende de esfuerzo suficiente, progresión, volumen recuperable, proteína y energía adecuadas. Entrena cada músculo unas dos veces por semana y deja normalmente 1–3 repeticiones en reserva."
      }
    },
    {
      id: "gym-beginner",
      terms: ["comecar na academia", "primeiro dia academia", "iniciante na academia", "beginner start at the gym", "start at gym", "new to gym", "fitnessstudio anfangen", "empezar en el gimnasio"],
      answers: {
        pt: "Para começar na academia, faça 2–3 treinos de corpo inteiro por semana com poucos movimentos: agachar ou leg press, empurrar, puxar, movimento de quadril e core. Use cargas que permitam técnica estável e 2–3 repetições em reserva, registre o treino e aumente devagar. Nas primeiras semanas, aprender os movimentos vale mais que sair exausta.",
        en: "To start at the gym, use 2–3 weekly full-body sessions built around a squat or leg press, a push, a pull, a hip hinge, and core work. Keep 2–3 reps in reserve, log sessions, and progress slowly; learning movements matters more than exhaustion.",
        de: "Zum Einstieg im Fitnessstudio 2–3 Ganzkörpereinheiten pro Woche mit Kniebeuge/Beinpresse, Drücken, Ziehen, Hüftbewegung und Core. Technik lernen und langsam steigern.",
        es: "Para empezar en el gimnasio, realiza 2–3 sesiones de cuerpo completo con sentadilla o prensa, empuje, tirón, bisagra de cadera y core. Aprende la técnica y progresa poco a poco."
      }
    },
    {
      id: "strength",
      terms: ["ganhar forca", "ficar mais forte", "aumentar carga", "strength", "stronger", "kraft", "ganar fuerza"],
      answers: {
        pt: "Para ganhar força, priorize movimentos que consiga repetir e medir, pratique-os com frequência e progrida sem sacrificar técnica. Uma estrutura comum usa 3–6 repetições nos exercícios principais, 2–5 séries e descansos de 2–4 minutos; acessórios podem ficar em faixas maiores. Evite testar seu máximo toda semana.",
        en: "For strength, prioritize repeatable measurable lifts and progress without sacrificing technique. Main lifts often use 3–6 reps, 2–5 sets, and 2–4 minute rests, while accessories can use higher reps. Avoid testing maximums every week.",
        de: "Für Kraft sollten messbare Grundübungen regelmäßig und technisch sauber gesteigert werden. Häufig passen 3–6 Wiederholungen, 2–5 Sätze und 2–4 Minuten Pause; Maximaltests nicht jede Woche.",
        es: "Para ganar fuerza, prioriza movimientos medibles y progresa sin perder técnica. Los ejercicios principales suelen usar 3–6 repeticiones, 2–5 series y descansos de 2–4 minutos."
      }
    },
    {
      id: "training-frequency",
      terms: ["quantas vezes devo treinar", "quantas vezes treinar", "frequencia de treino", "dias de treino por semana", "dias por semana", "how often should i train", "how often train", "training frequency", "wie oft trainieren", "cuantas veces entrenar"],
      answers: {
        pt: "A melhor frequência é a que distribui seu volume e permite recuperação. Para a maioria das pessoas, treinar força 2–4 dias por semana e trabalhar cada grupo muscular cerca de 2 vezes funciona bem. Iniciantes podem evoluir muito com 2–3 treinos de corpo inteiro; níveis mais avançados podem dividir o treino em mais dias.",
        en: "The best frequency distributes your workload while allowing recovery. For most people, 2–4 strength days weekly and training each muscle around twice works well. Beginners can progress substantially with 2–3 full-body sessions.",
        de: "Die beste Frequenz verteilt das Volumen und erlaubt Erholung. Für viele passen 2–4 Krafttage pro Woche und jede Muskelgruppe ungefähr zweimal.",
        es: "La mejor frecuencia distribuye el volumen y permite recuperarse. Para muchas personas funcionan 2–4 días de fuerza y cada músculo unas dos veces por semana."
      }
    },
    {
      id: "training-volume",
      terms: ["quantas series", "volume de treino", "series por musculo", "training volume", "how many sets", "trainingsvolumen", "cuantas series"],
      answers: {
        pt: "Volume útil é o número de séries desafiadoras que você consegue recuperar. Um início conservador é cerca de 6–10 séries semanais por grupo muscular, distribuídas em 2 sessões. Se desempenho, sono e dores estiverem controlados, acrescente 1–2 séries; se a performance cair por várias sessões, reduza.",
        en: "Useful volume is the number of challenging sets you can recover from. A conservative start is around 6–10 weekly sets per muscle over two sessions. Add 1–2 sets only when performance, sleep, and soreness remain manageable.",
        de: "Sinnvolles Volumen besteht aus anspruchsvollen Sätzen, von denen du dich erholst. Starte konservativ mit etwa 6–10 Wochensätzen pro Muskel und passe nach Leistung und Erholung an.",
        es: "El volumen útil son las series exigentes de las que puedes recuperarte. Empieza de forma conservadora con unas 6–10 series semanales por músculo y ajusta según rendimiento y recuperación."
      }
    },
    {
      id: "progressive-overload",
      terms: ["sobrecarga progressiva", "progredir treino", "mais peso ou repeticoes", "progressive overload", "increase weight", "progression", "progresion"],
      answers: {
        pt: "Sobrecarga progressiva não significa aumentar peso em todo treino. Você pode progredir com mais repetições na mesma carga, melhor técnica, maior amplitude, mais uma série ou pequena elevação de carga. Um método simples: escolha uma faixa, como 8–12; ao conseguir 12 em todas as séries com 1–3 repetições em reserva, aumente a carga e volte perto de 8.",
        en: "Progressive overload does not require adding weight every workout. Progress through reps, technique, range of motion, an extra set, or a small load increase. With an 8–12 range, add load after reaching 12 on every set with 1–3 reps in reserve.",
        de: "Progressive Steigerung bedeutet nicht jedes Training mehr Gewicht. Auch Wiederholungen, Technik, Bewegungsumfang oder ein zusätzlicher Satz zählen.",
        es: "La sobrecarga progresiva no exige subir peso en cada sesión. También puedes progresar con repeticiones, técnica, rango de movimiento o alguna serie adicional."
      }
    },
    {
      id: "fat-loss",
      terms: ["emagrecer", "perder gordura", "perder peso", "secar", "lose fat", "weight loss", "fat loss", "abnehmen", "perder grasa"],
      answers: {
        pt: "O emagrecimento exige um déficit energético sustentável, mas preservar massa muscular depende de proteína adequada, musculação e ritmo gradual. Priorize refeições saciantes, passos e atividade diária, sono e consistência. Avalie a média do peso por 2–3 semanas, não um único dia, antes de ajustar calorias.",
        en: "Fat loss requires a sustainable energy deficit, while preserving muscle benefits from adequate protein, strength training, and a gradual pace. Prioritize filling meals, daily movement, sleep, and consistency; judge 2–3 week weight trends rather than single days.",
        de: "Fettverlust braucht ein nachhaltiges Energiedefizit. Ausreichend Protein, Krafttraining und langsames Vorgehen helfen, Muskelmasse zu erhalten. Bewerte Trends über 2–3 Wochen.",
        es: "Perder grasa requiere un déficit sostenible. Proteína suficiente, fuerza y un ritmo gradual ayudan a conservar músculo. Evalúa tendencias de 2–3 semanas, no días aislados."
      }
    },
    {
      id: "weight-plateau",
      terms: ["peso estagnou", "peso parou", "meu peso parar", "se o peso parar", "parou de cair", "nao perco mais", "nao emagreco", "parei de emagrecer", "plato", "weight plateau", "not losing weight", "gewicht stagniert", "estancamiento peso"],
      answers: {
        pt: "Antes de chamar de platô, compare médias de 7 dias por pelo menos 2–3 semanas e considere ciclo menstrual, sal, carboidratos e constipação. Se a média realmente não cair, revise porções e bebidas, mantenha proteína, aumente levemente passos ou reduza cerca de 100–200 kcal — apenas uma mudança por vez.",
        en: "Before calling it a plateau, compare 7-day averages for at least 2–3 weeks and account for menstrual cycle, sodium, carbohydrate, and constipation. If the average truly stalls, review portions and drinks, then change either activity or roughly 100–200 kcal at a time.",
        de: "Vergleiche erst 7-Tage-Mittelwerte über 2–3 Wochen und beachte Zyklus, Salz und Kohlenhydrate. Bei echtem Stillstand nur eine kleine Änderung an Aktivität oder Energiezufuhr vornehmen.",
        es: "Antes de considerarlo estancamiento, compara promedios de 7 días durante 2–3 semanas. Si realmente no cambia, revisa porciones y modifica solo una variable cada vez."
      }
    },
    {
      id: "nutrition-basics",
      terms: ["alimentacao saudavel", "o que comer", "comer melhor", "dieta equilibrada", "healthy eating", "what should i eat", "what foods", "foods should i prioritize", "gesunde ernahrung", "alimentacion saludable"],
      answers: {
        pt: "Uma base simples é montar a maior parte das refeições com uma fonte de proteína, vegetais ou frutas, carboidrato adequado à atividade e alguma gordura. Não é preciso excluir alimentos: frequência, porção e conjunto da semana importam mais. Para facilitar, escolha 2–3 cafés da manhã e refeições principais que você goste e consiga repetir.",
        en: "A simple foundation is to build most meals around protein, vegetables or fruit, carbohydrate matched to activity, and some fat. You do not need to ban foods; frequency, portions, and the overall week matter more.",
        de: "Eine einfache Basis: Proteinquelle, Gemüse oder Obst, zur Aktivität passende Kohlenhydrate und etwas Fett. Einzelne Lebensmittel müssen nicht verboten werden; Gesamtmuster und Portionen zählen.",
        es: "Una base sencilla es incluir proteína, verduras o fruta, carbohidratos según la actividad y algo de grasa. No hace falta prohibir alimentos; importan más las porciones y el patrón semanal."
      }
    },
    {
      id: "protein-quality-timing",
      terms: ["fontes de proteina", "proteina vegetal", "proteina animal", "proteina antes ou depois", "distribuir proteina", "protein sources", "protein timing", "plant protein", "proteinquellen", "proteina vegetal"],
      answers: {
        pt: "O total diário de proteína é a prioridade. Depois, distribua em 3–5 refeições, cada uma com uma porção relevante. Carnes, ovos, laticínios, soja, feijões e combinações de leguminosas com cereais podem funcionar; fontes vegetais pedem atenção a variedade e quantidade. Antes ou depois do treino pode ser útil, mas não existe necessidade de consumir imediatamente ao terminar.",
        en: "Daily protein is the priority. Then distribute it across 3–5 meals with a meaningful serving each time. Meat, eggs, dairy, soy, legumes, and complementary plant foods can all work. Protein before or after training is useful, but it need not be consumed immediately.",
        de: "Die Tagesmenge an Protein ist am wichtigsten. Danach auf 3–5 Mahlzeiten verteilen. Tierische und gut kombinierte pflanzliche Quellen funktionieren; direkt nach dem Training ist kein Muss.",
        es: "El total diario de proteína es prioritario. Después, repártelo en 3–5 comidas. Fuentes animales y vegetales variadas funcionan; no es obligatorio consumirla inmediatamente al terminar."
      }
    },
    {
      id: "carbohydrates",
      terms: ["carboidrato", "carbo", "energia para treinar", "carbs", "carbohydrate", "kohlenhydrate", "carbohidratos"],
      answers: {
        pt: "Carboidratos são combustível importante para treinos intensos e esportes. A necessidade varia muito: pessoas moderadamente ativas frequentemente ficam bem em torno de 3–5 g/kg/dia, enquanto alto volume de endurance pode exigir mais. Distribua principalmente ao redor dos treinos e ajuste pelo desempenho, fome e objetivo.",
        en: "Carbohydrate is important fuel for hard training and sport. Needs vary widely: moderately active people often do well around 3–5 g/kg/day, while high-volume endurance can require more. Adjust around performance, appetite, and goals.",
        de: "Kohlenhydrate sind wichtiger Treibstoff für intensives Training und Sport. Der Bedarf variiert; moderat Aktive liegen häufig bei etwa 3–5 g/kg/Tag, Ausdauerathleten teils höher.",
        es: "Los carbohidratos son combustible importante para entrenamientos intensos. Las necesidades varían; una persona moderadamente activa suele estar alrededor de 3–5 g/kg/día y el endurance puede requerir más."
      }
    },
    {
      id: "dietary-fat",
      terms: ["gordura na dieta", "gorduras boas", "quanto de gordura", "dietary fat", "healthy fats", "nahrungsfett", "grasas saludables"],
      answers: {
        pt: "Gorduras participam de hormônios, absorção de vitaminas e saciedade. Evite reduzi-las demais; uma faixa prática comum é cerca de 20–35% das calorias, priorizando azeite, castanhas, sementes, abacate, peixes e outras fontes pouco processadas. O total deve caber na sua meta energética.",
        en: "Dietary fat supports hormones, vitamin absorption, and satiety. Avoid cutting it excessively; a practical range is often around 20–35% of calories, emphasizing minimally processed sources.",
        de: "Fette unterstützen Hormone, Vitaminaufnahme und Sättigung. Nicht zu stark reduzieren; häufig sind etwa 20–35 % der Energie eine praktikable Orientierung.",
        es: "Las grasas ayudan a hormonas, absorción de vitaminas y saciedad. Evita reducirlas demasiado; alrededor de 20–35% de las calorías suele ser una referencia práctica."
      }
    },
    {
      id: "fiber",
      terms: ["fibra", "intestino", "saciedade", "fiber", "constipation", "ballaststoffe", "fibra alimentaria"],
      answers: {
        pt: "Fibras ajudam saciedade, intestino e saúde metabólica. Uma meta prática costuma ficar perto de 25–38 g/dia, mas aumente aos poucos e acompanhe água para evitar desconforto. Feijão, aveia, frutas, verduras, sementes e grãos integrais facilitam atingir a meta.",
        en: "Fiber supports satiety, bowel function, and metabolic health. A practical target is often around 25–38 g/day; increase gradually and drink adequately to reduce discomfort.",
        de: "Ballaststoffe unterstützen Sättigung und Verdauung. Häufig sind etwa 25–38 g/Tag sinnvoll; langsam steigern und ausreichend trinken.",
        es: "La fibra ayuda a saciedad y digestión. Una meta práctica suele ser 25–38 g/día; aumenta gradualmente y acompaña con suficiente agua."
      }
    },
    {
      id: "pre-workout-nutrition",
      terms: ["o que comer antes do treino", "comer antes do treino", "antes do treino", "pre treino", "pre-workout meal", "what to eat before training", "eat before training", "vor dem training essen", "antes de entrenar"],
      answers: {
        pt: "Antes do treino, priorize algo que você digere bem: carboidrato para energia e uma porção de proteína. Com 2–3 horas, pode ser uma refeição completa; com 30–60 minutos, prefira algo menor, como fruta com iogurte. Quanto mais perto do treino, menor a porção de gordura e fibra para reduzir desconforto.",
        en: "Before training, choose food you digest well: carbohydrate for energy plus protein. A full meal can fit 2–3 hours before; within 30–60 minutes, use a smaller snack and limit excessive fat or fiber.",
        de: "Vor dem Training sind gut verträgliche Kohlenhydrate plus Protein sinnvoll. 2–3 Stunden vorher passt eine Mahlzeit, 30–60 Minuten vorher eher ein kleiner Snack.",
        es: "Antes de entrenar, elige carbohidratos fáciles de digerir y proteína. Una comida completa puede ir 2–3 horas antes; a 30–60 minutos, mejor algo pequeño."
      }
    },
    {
      id: "post-workout-nutrition",
      terms: ["depois do treino", "pos treino", "post workout", "after training", "nach dem training", "despues de entrenar"],
      answers: {
        pt: "Depois do treino, o total diário continua sendo mais importante que uma janela de poucos minutos. Faça uma refeição com proteína e carboidrato nas horas seguintes, reidrate-se e retome sua alimentação normal. Se você já comeu proteína antes do treino, não precisa correr para tomar shake imediatamente.",
        en: "After training, daily intake matters more than a tiny anabolic window. Have protein and carbohydrate within the next few hours, rehydrate, and resume normal eating; an immediate shake is unnecessary if you ate beforehand.",
        de: "Nach dem Training zählt die Tageszufuhr mehr als ein winziges Zeitfenster. In den nächsten Stunden Protein und Kohlenhydrate essen und rehydrieren.",
        es: "Después de entrenar importa más el total diario que una ventana de pocos minutos. Consume proteína y carbohidratos en las horas siguientes y rehidrátate."
      }
    },
    {
      id: "hydration",
      terms: ["agua", "hidratacao", "quantos litros", "desidrat", "water", "hydration", "wieviel wasser", "hidratacion"],
      answers: {
        pt: "Como ponto de partida, muitas pessoas usam cerca de 30–35 ml de líquidos por kg ao dia, ajustando por calor, suor, altitude e treino. Durante exercícios longos ou muito quentes, observe sede, perda de peso e cor da urina; evite tanto desidratação importante quanto beber volumes excessivos rapidamente. Eletrólitos fazem mais sentido quando há suor abundante ou sessões prolongadas.",
        en: "A starting point is roughly 30–35 ml of fluid per kg daily, adjusted for heat, sweat, altitude, and training. For long or hot sessions, use thirst, body-mass change, and urine color as practical signals; electrolytes become more relevant with heavy sweat or prolonged work.",
        de: "Als Ausgangspunkt gelten oft etwa 30–35 ml Flüssigkeit pro kg und Tag, angepasst an Hitze, Schweiß und Training. Elektrolyte sind vor allem bei starkem Schwitzen oder langen Einheiten relevant.",
        es: "Como punto de partida se usan unos 30–35 ml de líquido por kg al día, ajustando por calor, sudor y entrenamiento. Los electrolitos son más útiles con mucho sudor o sesiones largas."
      }
    },
    {
      id: "sleep",
      terms: ["sono", "dormir", "horas de sono", "sleep", "insomnia", "schlaf", "sueno"],
      answers: {
        pt: "Sono insuficiente piora recuperação, apetite, tomada de decisão e desempenho. Para a maioria dos adultos, 7–9 horas é uma boa referência. Mantenha horários relativamente consistentes, reduza cafeína nas 6–8 horas antes de dormir, escureça o ambiente e diminua estímulos na última hora.",
        en: "Insufficient sleep can impair recovery, appetite regulation, decision-making, and performance. Most adults can use 7–9 hours as a target, with consistent timing, less late caffeine, a dark room, and a calmer final hour.",
        de: "Zu wenig Schlaf beeinträchtigt Erholung, Appetit und Leistung. Für die meisten Erwachsenen sind 7–9 Stunden eine gute Orientierung; regelmäßige Zeiten und weniger spätes Koffein helfen.",
        es: "Dormir poco perjudica recuperación, apetito y rendimiento. Para la mayoría de adultos, 7–9 horas es una buena referencia, con horarios constantes y menos cafeína tarde."
      }
    },
    {
      id: "recovery",
      terms: ["dor muscular depois do treino", "como recuperar", "recuperacao", "cansaco", "fadiga", "dor muscular", "dolorido", "recovery after training", "recovery", "soreness", "fatigue", "erholung", "recuperacion"],
      answers: {
        pt: "Recuperação depende do conjunto: sono, calorias e proteína suficientes, hidratação, gestão de estresse e volume de treino adequado. Dor muscular leve não é requisito para progresso e pode permitir atividade leve; dor aguda, piora progressiva, perda de força incomum ou sintomas persistentes pedem interrupção e avaliação profissional.",
        en: "Recovery depends on sleep, adequate energy and protein, hydration, stress management, and suitable training volume. Mild soreness is not required for progress; sharp or worsening pain, unusual weakness, or persistent symptoms warrant stopping and professional assessment.",
        de: "Erholung hängt von Schlaf, Energie, Protein, Flüssigkeit, Stress und passendem Trainingsvolumen ab. Leichter Muskelkater ist kein Fortschrittsbeweis; scharfe oder zunehmende Schmerzen abklären lassen.",
        es: "La recuperación depende de sueño, energía, proteína, hidratación, estrés y volumen adecuado. El dolor muscular leve no es obligatorio; dolor agudo o creciente requiere parar y consultar."
      }
    },
    {
      id: "warmup-mobility",
      terms: ["aquecimento", "alongar antes", "mobilidade", "flexibilidade", "warm up", "stretch before", "mobility", "aufwarmen", "calentamiento"],
      answers: {
        pt: "Um bom aquecimento eleva gradualmente a temperatura e prepara os movimentos do treino. Faça 5–10 minutos de atividade leve, mobilidade dinâmica relevante e 2–4 séries progressivas do primeiro exercício. Alongamentos estáticos longos imediatamente antes de força ou potência podem ser deixados para outro momento se reduzirem seu desempenho.",
        en: "A good warm-up gradually raises temperature and rehearses the session. Use 5–10 minutes of light activity, relevant dynamic mobility, and 2–4 progressively heavier practice sets.",
        de: "Ein gutes Aufwärmen erhöht schrittweise die Temperatur und übt die Trainingsbewegungen: 5–10 Minuten leicht, dynamische Mobilität und progressive Aufwärmsätze.",
        es: "Un buen calentamiento eleva gradualmente la temperatura y prepara los movimientos: 5–10 minutos suaves, movilidad dinámica y series progresivas."
      }
    },
    {
      id: "creatine",
      terms: ["creatina", "creatine", "kreatin"],
      answers: {
        pt: "Creatina monohidratada é um dos suplementos mais estudados para força e desempenho em esforços repetidos. Uma estratégia simples é 3–5 g por dia, todos os dias; a fase de saturação é opcional. Pode ocorrer pequeno aumento inicial de peso por água dentro do músculo. Pessoas com doença renal, gestantes ou quem usa medicamentos relevantes devem conversar com profissional de saúde antes.",
        en: "Creatine monohydrate is among the best-studied supplements for strength and repeated high-intensity performance. A simple approach is 3–5 g daily; loading is optional. A small initial water-related weight increase can occur.",
        de: "Kreatin-Monohydrat ist gut für Kraft und wiederholte intensive Belastungen untersucht. Einfach sind 3–5 g täglich; eine Ladephase ist optional.",
        es: "La creatina monohidrato está muy estudiada para fuerza y esfuerzos intensos repetidos. Una pauta simple es 3–5 g diarios; la carga es opcional."
      }
    },
    {
      id: "supplements",
      terms: ["suplemento", "whey", "pre treino suplemento", "fat burner", "supplement", "protein powder", "nahrungserganzung", "suplementos"],
      answers: {
        pt: "Suplementos devem resolver uma necessidade concreta, não substituir alimentação, sono e treino. Whey é apenas uma forma prática de proteína; cafeína pode ajudar desempenho, mas exige atenção a dose, ansiedade e sono; produtos para 'queimar gordura' raramente entregam o que prometem. Prefira produtos testados por terceiros quando houver risco antidoping.",
        en: "Supplements should solve a specific need, not replace food, sleep, or training. Whey is simply convenient protein; caffeine can aid performance but affects anxiety and sleep; fat burners rarely match their claims. Third-party testing matters for anti-doping risk.",
        de: "Supplemente sollten einen konkreten Bedarf lösen. Whey ist nur praktisches Protein; Koffein kann Leistung unterstützen, aber Schlaf und Unruhe beeinflussen; Fatburner halten selten ihre Versprechen.",
        es: "Los suplementos deben resolver una necesidad concreta. Whey es proteína práctica; la cafeína puede ayudar pero afectar sueño y ansiedad; los quemadores rara vez cumplen lo prometido."
      }
    },
    {
      id: "cardio",
      terms: ["cardio", "folego", "condicionamento", "aerobico", "endurance", "ausdauer", "resistencia aerobica"],
      answers: {
        pt: "Para melhorar o condicionamento, combine uma base leve com pequenas doses intensas. Comece com 2–3 sessões semanais de 20–40 minutos em ritmo no qual ainda consegue falar frases; depois acrescente, no máximo, uma sessão intervalada. Aumente primeiro a duração, depois a intensidade.",
        en: "To improve conditioning, combine an easy aerobic base with a small amount of intensity. Start with 2–3 weekly sessions of 20–40 minutes at conversational pace, then add at most one interval session.",
        de: "Für Ausdauer zuerst 2–3 lockere Einheiten von 20–40 Minuten im Gesprächstempo aufbauen, später höchstens eine Intervalleinheit ergänzen.",
        es: "Para mejorar la resistencia, empieza con 2–3 sesiones suaves de 20–40 minutos a ritmo conversacional y después añade como máximo una sesión de intervalos."
      }
    },
    {
      id: "running",
      terms: ["corrida", "correr", "5 km", "10 km", "running", "run faster", "laufen", "carrera"],
      answers: {
        pt: "Na corrida, aumente volume gradualmente e mantenha a maioria dos quilômetros em ritmo confortável. Para começar, alterne corrida e caminhada 3 vezes por semana; para melhorar tempo, acrescente uma sessão de ritmo ou intervalos, mantendo pelo menos 48 horas entre treinos exigentes. Fortalecer panturrilhas, quadris e posteriores ajuda tolerância à carga.",
        en: "In running, build volume gradually and keep most mileage easy. Beginners can alternate running and walking three times weekly; for speed, add one tempo or interval session with at least 48 hours between hard days.",
        de: "Beim Laufen Umfang langsam steigern und den Großteil locker halten. Anfänger können dreimal pro Woche Lauf und Gehen abwechseln; harte Einheiten mit mindestens 48 Stunden Abstand.",
        es: "En carrera, aumenta volumen gradualmente y mantén la mayoría suave. Principiantes pueden alternar correr y caminar 3 veces por semana; separa los días duros al menos 48 horas."
      }
    },
    {
      id: "football",
      terms: ["futebol", "drible", "chute", "football", "soccer", "dribbling", "fussball", "futbol"],
      answers: {
        pt: "Para melhorar no futebol, combine técnica frequente com condicionamento específico. Faça blocos curtos de domínio e drible com os dois pés, acelerações de 10–30 m, mudanças de direção com descanso completo e jogos reduzidos. Qualidade cai quando há fadiga excessiva, então treine técnica antes dos blocos mais cansativos.",
        en: "For football performance, combine frequent technical practice with sport-specific conditioning: short two-foot ball-control blocks, 10–30 m accelerations, well-rested changes of direction, and small-sided games. Practice skill before heavy fatigue.",
        de: "Für Fußball Technik häufig üben und spezifische Kondition ergänzen: Ballkontrolle mit beiden Füßen, 10–30-m-Sprints, Richtungswechsel mit voller Pause und kleine Spielformen.",
        es: "Para mejorar en fútbol, combina técnica frecuente con aceleraciones de 10–30 m, cambios de dirección bien descansados y juegos reducidos. Practica técnica antes de mucha fatiga."
      }
    },
    {
      id: "sports-performance",
      terms: ["performance esportiva", "melhorar desempenho", "explosao", "velocidade", "agilidade", "sports performance", "athletic performance", "sportliche leistung", "rendimiento deportivo"],
      answers: {
        pt: "Performance melhora quando o treino reflete a demanda do esporte. Separe capacidades: técnica, força, potência, velocidade, resistência e recuperação. Priorize 1–2 qualidades por bloco, coloque movimentos rápidos no início da sessão, descanse o suficiente para manter qualidade e monitore desempenho em vez de apenas cansaço.",
        en: "Performance improves when training reflects sport demands. Separate skill, strength, power, speed, endurance, and recovery; prioritize 1–2 qualities per block, place fast work early, rest enough to preserve quality, and track performance rather than fatigue alone.",
        de: "Sportleistung verbessert sich durch anforderungsspezifisches Training. Technik, Kraft, Leistung, Schnelligkeit und Ausdauer gezielt planen und schnelle Arbeit früh in der Einheit durchführen.",
        es: "El rendimiento mejora cuando el entrenamiento refleja el deporte. Separa técnica, fuerza, potencia, velocidad y resistencia; prioriza 1–2 cualidades por bloque y controla rendimiento, no solo fatiga."
      }
    },
    {
      id: "pain-safety",
      terms: ["dor no joelho", "dor nas costas", "dor no ombro", "lesao", "machuquei", "sharp pain", "injury", "pain during exercise", "verletzung", "dolor al entrenar"],
      answers: {
        pt: "Não é seguro diagnosticar dor pelo chat. Pare o movimento que provoca dor aguda, piora progressiva, inchaço importante, instabilidade, dormência ou perda de força. Não tente 'treinar por cima'. Um fisioterapeuta ou médico pode avaliar; enquanto isso, mantenha apenas movimentos indolores e atividades liberadas para você.",
        en: "A chat cannot safely diagnose pain. Stop movements causing sharp or worsening pain, marked swelling, instability, numbness, or strength loss. Do not train through it; seek assessment and keep only pain-free activities you are cleared to do.",
        de: "Schmerzen lassen sich im Chat nicht sicher diagnostizieren. Bei scharfem oder zunehmendem Schmerz, Schwellung, Instabilität, Taubheit oder Kraftverlust abbrechen und untersuchen lassen.",
        es: "No se puede diagnosticar dolor con seguridad por chat. Detén movimientos con dolor agudo o creciente, hinchazón, inestabilidad, entumecimiento o pérdida de fuerza y busca evaluación."
      }
    },
    {
      id: "habits-motivation",
      terms: ["motivacao", "nao consigo manter", "falta de disciplina", "criar habito", "motivation", "consistency", "disziplin", "motivacion"],
      answers: {
        pt: "Consistência melhora quando o plano exige pouca negociação. Defina um mínimo viável — por exemplo, 20 minutos duas vezes por semana —, escolha dias e horários, prepare roupa e ambiente antes e registre presença. Em semanas ruins, reduza o treino em vez de abandonar; depois aumente gradualmente.",
        en: "Consistency improves when the plan requires little negotiation. Set a minimum viable target, schedule it, prepare the environment, and track attendance. During difficult weeks, shrink the workout instead of abandoning it.",
        de: "Konstanz wird leichter mit einem klaren Mindestplan, festen Terminen, vorbereiteter Umgebung und Anwesenheitsprotokoll. In schwierigen Wochen kürzen statt ganz ausfallen lassen.",
        es: "La constancia mejora con un mínimo viable, horario fijo, entorno preparado y registro. En semanas difíciles, reduce la sesión en vez de abandonarla."
      }
    },
    {
      id: "cravings",
      terms: ["vontade de doce", "compulsao", "beliscar", "fome emocional", "cravings", "binge", "heisshunger", "antojos"],
      answers: {
        pt: "Vontades intensas costumam piorar com restrição excessiva, poucas refeições saciantes, sono ruim e fácil acesso aos alimentos-gatilho. Monte refeições com proteína, fibra e volume, planeje uma porção do alimento desejado e observe o contexto da vontade. Episódios frequentes de perda de controle, culpa ou compensação merecem apoio de nutricionista e psicólogo.",
        en: "Cravings often worsen with excessive restriction, low-satiety meals, poor sleep, and easy access to trigger foods. Build meals with protein and fiber, plan a portion of desired foods, and notice the trigger context. Frequent loss-of-control episodes deserve professional support.",
        de: "Starker Heißhunger wird oft durch strenge Verbote, wenig sättigende Mahlzeiten und schlechten Schlaf verstärkt. Protein, Ballaststoffe und geplante Portionen helfen; häufige Kontrollverluste professionell begleiten lassen.",
        es: "Los antojos suelen empeorar con restricción excesiva, poca saciedad y mal sueño. Incluye proteína y fibra, planifica porciones y busca apoyo profesional si hay pérdida frecuente de control."
      }
    }
  ];

  const followUpWords = /^(e |mas |entao|isso|nesse caso|e se|what about|and |but |und |aber |y |pero )/;

  function scoreTopic(topic, query) {
    return topic.terms.reduce((score, term) => {
      const normalizedTerm = normalize(term);
      if (!query.includes(normalizedTerm)) return score;
      return score + 2 + normalizedTerm.split(/\s+/).length;
    }, 0);
  }

  function addPersonalization(text, language, profile, topicId) {
    if (!profile) return text;
    if (topicId === "hydration" && profile.weightKg) {
      const low = Math.round(profile.weightKg * 30 / 100) * 100;
      const high = Math.round(profile.weightKg * 35 / 100) * 100;
      const extra = {
        pt: ` Com ${profile.weightKg} kg, isso corresponde inicialmente a cerca de ${(low / 1000).toFixed(1).replace(".", ",")}–${(high / 1000).toFixed(1).replace(".", ",")} L/dia antes dos ajustes pelo treino e calor.`,
        en: ` At ${profile.weightKg} kg, that is initially about ${(low / 1000).toFixed(1)}–${(high / 1000).toFixed(1)} L/day before exercise and heat adjustments.`,
        de: ` Bei ${profile.weightKg} kg sind das zunächst etwa ${(low / 1000).toFixed(1)}–${(high / 1000).toFixed(1)} L/Tag vor Anpassungen an Training und Hitze.`,
        es: ` Con ${profile.weightKg} kg, equivale inicialmente a unos ${(low / 1000).toFixed(1)}–${(high / 1000).toFixed(1)} L/día antes de ajustar por ejercicio y calor.`
      }[language];
      return text + extra;
    }
    if (topicId === "carbohydrates" && profile.weightKg) {
      const low = Math.round(profile.weightKg * 3);
      const high = Math.round(profile.weightKg * 5);
      const extra = {
        pt: ` Para ${profile.weightKg} kg, a faixa de 3–5 g/kg seria aproximadamente ${low}–${high} g/dia, mas seu volume de treino e objetivo devem definir o ajuste final.`,
        en: ` At ${profile.weightKg} kg, 3–5 g/kg equals roughly ${low}–${high} g/day, with final adjustment based on training volume and goals.`,
        de: ` Bei ${profile.weightKg} kg entsprechen 3–5 g/kg etwa ${low}–${high} g/Tag; Trainingsumfang und Ziel bestimmen die Anpassung.`,
        es: ` Con ${profile.weightKg} kg, 3–5 g/kg equivale a unos ${low}–${high} g/día, ajustando según entrenamiento y objetivo.`
      }[language];
      return text + extra;
    }
    return text;
  }

  function answer({ text, language = "en", profile, lastTopic }) {
    const query = normalize(text);
    const ranked = topics
      .map(topic => ({ topic, score: scoreTopic(topic, query) }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score);

    let selected = ranked[0]?.topic || null;
    if (!selected && followUpWords.test(query) && lastTopic) {
      selected = topics.find(topic => topic.id === lastTopic) || null;
    }
    if (!selected) return null;

    const base = selected.answers[language] || selected.answers.en;
    return {
      topic: selected.id,
      text: addPersonalization(base, language, profile, selected.id),
      confidence: ranked[0]?.score || 1
    };
  }

  window.FitnessKnowledgeEngine = { answer, topics: topics.map(({ id, terms }) => ({ id, terms })) };
})();

