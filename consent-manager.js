/* Consent and privacy state. Fitness profile data is session-only until persistence is explicitly authorized. */
(function () {
  "use strict";
  const POLICY_VERSION = "fitness-privacy-2026-08-v2";
  const KEY_PREFIX = "fitness-assistant-fitness-consent-v1:";

  function safeRead(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }

  function create(visitorId) {
    const key = `${KEY_PREFIX}${visitorId}`;
    const stored = safeRead(key);
    const validStored = stored && stored.policyVersion === POLICY_VERSION
      && [null, "session", "persistent"].includes(stored.profileStorage)
      && [null, true, false].includes(stored.anonymousImprovement)
      && [null, true, false].includes(stored.externalAI);
    let record = validStored ? {
      policyVersion: POLICY_VERSION,
      profileStorage: stored.profileStorage,
      anonymousImprovement: stored.anonymousImprovement,
      externalAI: stored.externalAI,
      purposes: Array.isArray(stored.purposes) ? stored.purposes.filter(item => ["fitness-personalization", "anonymous-product-improvement", "external-ai-response"].includes(item)) : [],
      categories: Array.isArray(stored.categories) ? stored.categories.filter(item => ["identity-alias", "fitness-profile", "preferences", "limitations"].includes(item)) : [],
      grantedAt: typeof stored.grantedAt === "string" ? stored.grantedAt : null,
      improvementGrantedAt: typeof stored.improvementGrantedAt === "string" ? stored.improvementGrantedAt : null,
      improvementRevokedAt: typeof stored.improvementRevokedAt === "string" ? stored.improvementRevokedAt : null,
      externalAIGrantedAt: typeof stored.externalAIGrantedAt === "string" ? stored.externalAIGrantedAt : null,
      externalAIRevokedAt: typeof stored.externalAIRevokedAt === "string" ? stored.externalAIRevokedAt : null,
      wizardCompleted: stored.wizardCompleted === true,
      updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : null,
      revokedAt: typeof stored.revokedAt === "string" ? stored.revokedAt : null,
      source: "chatbot-consent-card"
    } : {
      policyVersion: POLICY_VERSION,
      profileStorage: null,
      anonymousImprovement: null,
      externalAI: null,
      purposes: [],
      categories: [],
      grantedAt: null,
      improvementGrantedAt: null,
      improvementRevokedAt: null,
      externalAIGrantedAt: null,
      externalAIRevokedAt: null,
      wizardCompleted: false,
      updatedAt: null,
      revokedAt: null,
      source: "chatbot-consent-card"
    };
    const persist = () => localStorage.setItem(key, JSON.stringify(record));
    const update = changes => {
      record = { ...record, ...changes, updatedAt: new Date().toISOString() };
      persist();
      return status();
    };
    const status = () => ({ ...record });
    return {
      policyVersion: POLICY_VERSION,
      status,
      needsChoice: () => record.wizardCompleted !== true || record.profileStorage === null || record.anonymousImprovement === null || record.externalAI === null,
      canPersistProfile: () => record.profileStorage === "persistent" && !record.revokedAt,
      canImprove: () => record.anonymousImprovement === true && !record.revokedAt,
      canUseExternalAI: () => record.externalAI === true && !record.revokedAt,
      chooseProfileStorage(mode) {
        if (!['session', 'persistent'].includes(mode)) throw new Error("Invalid profile storage mode");
        return update({
          profileStorage: mode,
          purposes: [...new Set([...(mode === "persistent" ? ["fitness-personalization"] : []), ...(record.anonymousImprovement === true ? ["anonymous-product-improvement"] : []), ...(record.externalAI === true ? ["external-ai-response"] : [])])],
          categories: mode === "persistent" ? ["identity-alias", "fitness-profile", "preferences", "limitations"] : [],
          grantedAt: mode === "persistent" ? new Date().toISOString() : null,
          revokedAt: null
        });
      },
      chooseImprovement(allowed) {
        const enabled = Boolean(allowed);
        return update({
          anonymousImprovement: enabled,
          purposes: [...new Set([...(record.profileStorage === "persistent" ? ["fitness-personalization"] : []), ...(enabled ? ["anonymous-product-improvement"] : []), ...(record.externalAI === true ? ["external-ai-response"] : [])])],
          improvementGrantedAt: enabled ? new Date().toISOString() : record.improvementGrantedAt,
          improvementRevokedAt: enabled ? null : new Date().toISOString()
        });
      },
      chooseExternalAI(allowed) {
        const enabled = Boolean(allowed);
        return update({
          externalAI: enabled,
          purposes: [...new Set([...(record.profileStorage === "persistent" ? ["fitness-personalization"] : []), ...(record.anonymousImprovement === true ? ["anonymous-product-improvement"] : []), ...(enabled ? ["external-ai-response"] : [])])],
          externalAIGrantedAt: enabled ? new Date().toISOString() : record.externalAIGrantedAt,
          externalAIRevokedAt: enabled ? null : new Date().toISOString()
        });
      },
      completeWizard() { return update({ wizardCompleted: true }); },
      revoke() { const now = new Date().toISOString(); return update({ profileStorage: "session", anonymousImprovement: false, externalAI: false, purposes: [], categories: [], revokedAt: now, improvementRevokedAt: now, externalAIRevokedAt: now }); },
      clear() { localStorage.removeItem(key); record = { policyVersion: POLICY_VERSION, profileStorage: null, anonymousImprovement: null, externalAI: null, purposes: [], categories: [], grantedAt: null, improvementGrantedAt: null, improvementRevokedAt: null, externalAIGrantedAt: null, externalAIRevokedAt: null, wizardCompleted: false, updatedAt: null, revokedAt: null, source: "chatbot-consent-card" }; },
      exportRecord: status
    };
  }

  window.FitnessConsentManager = { create, policyVersion: POLICY_VERSION };
})();

