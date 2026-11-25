import { Mic, Scale, ShoppingBag, Sparkles } from "lucide-react";
import { AiHomeFace } from "./ai-home-face";

const points = [
  { icon: Sparkles, title: "Ask in your own words", text: "No filters to fiddle with. Just describe what you need." },
  { icon: Scale, title: "Compare side by side", text: "Live prices and specs from our catalogue." },
  { icon: Mic, title: "Just speak", text: "Tap the robot and it talks back." },
  { icon: ShoppingBag, title: "It does the clicking", text: "Opens pages and fills your cart for you." },
];

/** Home-page band introducing VOLTA AI: just the robot face, which opens the voice assistant when tapped. */
export function AiChatSection() {
  return (
    <section aria-labelledby="ai-chat-title" className="container-page mt-10 sm:mt-14">
      <div className="relative isolate overflow-hidden rounded-3xl bg-dark px-4 py-7 sm:rounded-[2rem] text-white sm:px-10 sm:py-12 lg:px-14 lg:pb-20 lg:pt-16">
        {/* Soft green glow and a fine grid, the only decoration. */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-32 -z-10 h-96 w-96 rounded-full bg-[#34b673]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 right-0 -z-10 h-96 w-96 rounded-full bg-[#06793d]/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />

        <div className="grid items-center gap-8 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div className="max-lg:text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#5fcf93]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> VOLTA AI
            </p>
            <h2 id="ai-chat-title" className="mt-4 text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-4xl lg:text-[2.75rem]">
              Shop by simply
              <br />
              <span className="text-[#5fcf93]">asking.</span>
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-6 text-white/70 max-lg:mx-auto sm:mt-4 sm:text-base sm:leading-7">Talk to our shopping assistant to find, compare and buy. It understands English, Sinhala and Tamil.</p>

            <ul className="mt-6 grid grid-cols-2 gap-3 text-left sm:mt-8 sm:gap-5">
              {points.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:flex-row sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#5fcf93]">
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-white/60 sm:text-sm">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <AiHomeFace />
        </div>
      </div>
    </section>
  );
}
