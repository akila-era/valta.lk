/** Opens the VOLTA AI voice assistant from anywhere on the page (the home-page face uses this). */
export const AI_OPEN_EVENT = "volta-ai:open";
export const openAi = (listen = true) => window.dispatchEvent(new CustomEvent(AI_OPEN_EVENT, { detail: { listen } }));
