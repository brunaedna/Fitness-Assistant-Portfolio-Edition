/* Structured, versioned offline exercise registry used for exact substitutions and media lookup. */
(function () {
  "use strict";
  const VERSION = "2026.08.1";
  // Proprietary visual assets are intentionally excluded from the public portfolio edition.
  const imageByGroup = Object.freeze({});
  const raw = [
    ["chair-squat","Agachamento para cadeira","legs","squat","bodyweight","beginner",["quadríceps","glúteos"],["goblet-squat","leg-press"]],
    ["goblet-squat","Agachamento goblet","legs","squat","dumbbells","beginner",["quadríceps","glúteos"],["chair-squat","leg-press"]],
    ["leg-press","Leg press","legs","squat","gym","beginner",["quadríceps","glúteos"],["goblet-squat","chair-squat"]],
    ["reverse-lunge","Afundo reverso","legs","lunge","bodyweight","beginner",["quadríceps","glúteos"],["step-up","split-squat"]],
    ["step-up","Step-up","legs","lunge","bodyweight","beginner",["quadríceps","glúteos"],["reverse-lunge","split-squat"]],
    ["romanian-deadlift","Levantamento romeno","legs","hinge","dumbbells","intermediate",["posteriores","glúteos"],["bodyweight-good-morning","hip-thrust"]],
    ["bodyweight-good-morning","Bom-dia sem carga","legs","hinge","bodyweight","beginner",["posteriores","glúteos"],["romanian-deadlift","glute-bridge"]],
    ["glute-bridge","Ponte de glúteos","legs","bridge","bodyweight","beginner",["glúteos","posteriores"],["hip-thrust","bodyweight-good-morning"]],
    ["hip-thrust","Hip thrust","legs","bridge","gym","intermediate",["glúteos","posteriores"],["glute-bridge","romanian-deadlift"]],
    ["calf-raise","Elevação de panturrilhas","legs","calf","bodyweight","beginner",["panturrilhas"],["seated-calf-raise"]],
    ["incline-pushup","Flexão inclinada","chest","horizontal-push","bodyweight","beginner",["peitoral","tríceps"],["dumbbell-bench-press","wall-pushup"]],
    ["wall-pushup","Flexão na parede","chest","horizontal-push","bodyweight","beginner",["peitoral","tríceps"],["incline-pushup"]],
    ["dumbbell-bench-press","Supino com halteres","chest","horizontal-push","dumbbells","intermediate",["peitoral","tríceps"],["incline-pushup","chest-press"]],
    ["incline-dumbbell-press","Supino inclinado com halteres","chest","incline-push","dumbbells","intermediate",["peitoral superior","tríceps"],["incline-pushup"]],
    ["dumbbell-fly","Crucifixo com halteres","chest","chest-isolation","dumbbells","intermediate",["peitoral"],["band-chest-press"]],
    ["band-chest-press","Press de peito com elástico","chest","horizontal-push","bands","beginner",["peitoral","tríceps"],["incline-pushup"]],
    ["bent-row","Remada curvada","back","horizontal-pull","dumbbells","intermediate",["dorsais","romboides"],["one-arm-row","towel-row"]],
    ["one-arm-row","Remada unilateral apoiada","back","horizontal-pull","dumbbells","beginner",["dorsais","romboides"],["bent-row","towel-row"]],
    ["band-pulldown","Puxada com elástico","back","vertical-pull","bands","beginner",["latíssimo","bíceps"],["lat-pulldown","prone-y-raise"]],
    ["lat-pulldown","Puxada frontal","back","vertical-pull","gym","beginner",["latíssimo","bíceps"],["band-pulldown"]],
    ["prone-y-raise","Elevação Y deitada","back","scapular","bodyweight","beginner",["trapézio","deltoide posterior"],["reverse-fly"]],
    ["overhead-press","Desenvolvimento com halteres","shoulders","vertical-push","dumbbells","intermediate",["deltoides","tríceps"],["pike-pushup"]],
    ["pike-pushup","Flexão pike assistida","shoulders","vertical-push","bodyweight","intermediate",["deltoides","tríceps"],["overhead-press"]],
    ["lateral-raise","Elevação lateral","shoulders","shoulder-isolation","dumbbells","beginner",["deltoide lateral"],["band-lateral-raise"]],
    ["reverse-fly","Crucifixo inverso","shoulders","scapular","dumbbells","beginner",["deltoide posterior","trapézio"],["prone-y-raise"]],
    ["biceps-curl","Rosca direta","arms","elbow-flexion","dumbbells","beginner",["bíceps"],["hammer-curl","self-curl"]],
    ["hammer-curl","Rosca martelo","arms","elbow-flexion","dumbbells","beginner",["bíceps","braquial"],["biceps-curl"]],
    ["self-curl","Rosca auto-resistida","arms","elbow-flexion","bodyweight","beginner",["bíceps"],["biceps-curl"]],
    ["triceps-extension","Extensão de tríceps","arms","elbow-extension","dumbbells","beginner",["tríceps"],["wall-triceps"]],
    ["wall-triceps","Extensão de tríceps na parede","arms","elbow-extension","bodyweight","beginner",["tríceps"],["triceps-extension"]],
    ["dead-bug","Dead bug","core","anti-extension","bodyweight","beginner",["core"],["bird-dog","plank"]],
    ["plank","Prancha","core","anti-extension","bodyweight","beginner",["core"],["dead-bug"]],
    ["side-plank","Prancha lateral","core","anti-lateral-flexion","bodyweight","beginner",["oblíquos","core"],["bird-dog"]],
    ["bird-dog","Bird-dog","core","stability","bodyweight","beginner",["core","glúteos"],["dead-bug"]]
  ];
  const records = raw.map(([id,name,group,pattern,equipment,level,muscles,substitutions], index) => ({
    id, name, aliases: [name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")], group, primaryMuscles: muscles,
    secondaryMuscles: [], pattern, equipment, level, instructions: "Mantenha postura estável, amplitude confortável e movimento controlado.",
    commonErrors: ["perder o alinhamento", "usar amplitude dolorosa", "acelerar sem controle"], sets: [2,4], reps: [8,15], restSeconds: [60,150],
    progression: "Aumente primeiro as repetições; depois eleve a carga gradualmente.", regression: substitutions[0] || null, substitutions,
    limitations: [], image: imageByGroup[group] || null, imagePanel: null, source: "Portfolio exercise registry", version: VERSION
  }));
  const byId = new Map(records.map(item => [item.id, item]));
  const normalize = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  function find(value) { const t = normalize(value); return byId.get(value) || records.find(item => t.includes(normalize(item.name)) || item.aliases.some(alias => t.includes(alias))) || null; }
  function alternatives(value, constraints = {}) {
    const current = typeof value === "string" ? find(value) : value;
    if (!current) return [];
    return records.filter(item => item.id !== current.id && item.pattern === current.pattern && item.group === current.group)
      .filter(item => !constraints.equipment || constraints.equipment === "gym" || item.equipment === constraints.equipment || item.equipment === "bodyweight")
      .sort((a,b) => Number(current.substitutions.includes(b.id)) - Number(current.substitutions.includes(a.id)));
  }
  window.FitnessExerciseDB = { version: VERSION, records, find, alternatives, get: id => byId.get(id) || null };
})();


