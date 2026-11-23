// What a business supplies to the chatbot engine. The engine knows how to talk to Claude, parse the reply, guard
// against abuse, learn from past conversations and save them. It does not know whose bot it is: this is the seam.
import type { OpeningStat } from './learning.ts';

export interface Business<Ctx = unknown> {
  key: string;                                   // the value saved as `business` on every conversation
  origins: string[];                             // sites allowed to call the engine (localhost always is)
  testOrigin?: string;                           // the one origin allowed to compare models
  ageRange: string;
  staticPrompt: (age: string) => string;
  adTexts: Record<string, string>;               // the ad sentence by ?c= key, kept on the server
  adPain: Record<string, string>;
  openingPrompt: (adText: string, stats: OpeningStat[], pain?: string) => string;
  dynamicPrompt: (ctx: Ctx | null, adText: string, ageRange: string, opening?: string, learning?: string, turns?: number, pain?: string) => string;
  loadContext: () => Promise<Ctx | null>;        // live facts for the prompt (for Harpatka, the next meeting from the roster API)
  rpc: { usage: string; chip: string; offer: string; openingStats: string; chipStats: string; offerStats: string; questionStats: string };
  saltDefault: string;
}
