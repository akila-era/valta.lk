"use client";

import { Check, Volume2, VolumeX } from "lucide-react";
import { openAi } from "@/components/assistant/ai-open";
import { Wave } from "@/components/assistant/level-wave";
import { AiLottie } from "@/components/assistant/ai-lottie";
import { useAiChat } from "@/components/assistant/use-ai-chat";
import { formatLkr } from "@/lib/utils/money";


/**
 * The home-page robot face holds the whole voice conversation right here: tap it, speak, and it answers out loud
 * (mouth moving) while the words it heard and its reply appear underneath. Actions such as opening a page or adding to cart still happen.
 */
export function AiHomeFace() {
  const { msgs, busy, listening, speak, setSpeak, canListen, heard, go, toggleMic, faceState, level, speakNote, live } = useAiChat();
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const last = msgs[msgs.length - 1];
  const reply = last?.role === "model" ? last : undefined;

  return (
    <div className="relative flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={canListen ? toggleMic : () => openAi(false)}
        aria-label={live ? "End the voice conversation" : "Talk to VOLTA AI"}
        aria-pressed={live}
        className="group relative h-60 w-60 transition-transform duration-300 hover:scale-105 active:scale-95 sm:h-80 sm:w-80 lg:h-[19rem] lg:w-[19rem]"
      >
        <span aria-hidden className={`absolute inset-[-18%] rounded-full blur-3xl ${faceState === "idle" ? "bg-[#34b673]/30 animate-ai-glow" : "bg-cyan-300/40 animate-ai-glow"}`} />
        <AiLottie className="relative h-full w-full drop-shadow-[0_20px_30px_rgb(0_0_0/0.5)]" />
      </button>
      {canListen && msgs.length > 0 && (
        <button
          type="button"
          onClick={() => setSpeak((v) => !v)}
          aria-pressed={speak}
          aria-label={speak ? "Turn voice replies off" : "Turn voice replies on"}
          title={speak ? "Voice replies on" : "Voice replies off"}
          className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors hover:text-white lg:-right-8"
        >
          {speak ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
        </button>
      )}

      {/* On desktop the reply and the voice toggle hang below the face, so the face itself stays centred in the card. */}
      <div className="flex w-full flex-col items-center gap-4 lg:absolute lg:left-1/2 lg:top-full lg:mt-4 lg:w-80 lg:-translate-x-1/2">
      {speakNote && <p className="max-w-xs text-center text-xs text-white/60">{speakNote}</p>}
      <div className="flex min-h-[3.5rem] w-full max-w-sm flex-col justify-start space-y-2 text-center lg:min-h-0" aria-live="polite">
        {listening ? (
          <p className="flex items-center justify-center gap-3 text-sm text-white">
            <Wave level={level} tone="light" /> <span className="line-clamp-2">{heard || "Listening, go ahead..."}</span>
          </p>
        ) : busy ? (
          <p className="text-sm text-white/70">Thinking...</p>
        ) : reply ? (
          <>
            {lastUser && <p className="line-clamp-1 text-xs text-white/50 lg:hidden">&ldquo;{lastUser.text}&rdquo;</p>}
            <p className={`line-clamp-4 text-sm leading-6 lg:line-clamp-2 ${reply.error ? "text-red-300" : "text-white"}`}>{reply.text}</p>
            {reply.notes && reply.notes.length > 0 && (
              <ul className="flex flex-wrap justify-center gap-1.5">
                {reply.notes.map((n, i) => (
                  <li key={i} className="inline-flex items-center gap-1 rounded-full bg-[#34b673]/20 px-2.5 py-1 text-xs font-medium text-[#5fcf93]">
                    <Check className="h-3 w-3" aria-hidden /> {n}
                  </li>
                ))}
              </ul>
            )}
            {reply.products && reply.products.length > 0 && (
              <ul className="flex flex-wrap justify-center gap-1.5">
                {reply.products.slice(0, 4).map((p) => (
                  <li key={p.slug}>
                    <button type="button" onClick={() => go(`/products/${encodeURIComponent(p.slug)}`)} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/90 transition-colors hover:border-white/40">
                      {p.name.length > 22 ? `${p.name.slice(0, 22)}…` : p.name} · {formatLkr(p.price)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mx-auto w-fit rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/80">
            {canListen ? "Tap and say what you need" : "Voice needs Chrome or Edge. Tap to open chat."}
          </p>
        )}
      </div>


      </div>
    </div>
  );
}
