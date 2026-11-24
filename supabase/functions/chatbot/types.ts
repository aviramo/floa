// The generic journey engine. Everything that varies is data: the journey (milestones), the research profile for the
// campaign's topic and segment, the business (persona, allowed sites, live facts) and approved insights.
// The engine itself knows none of them by name.

export interface Milestone {
  id: string;                 // stable key, stored in session state
  title: string;
  goal: string;               // what this milestone is for
  learn: string[];            // what is worth learning from the visitor here
  doneWhen: string;           // completion condition, in words the model can judge
  skipWhen?: string;          // when the milestone may be skipped
}

export interface JourneyDef {
  type: string;               // 'pain', later 'inspiration'
  version: number;
  milestones: Milestone[];
  targetBotMessages: number;  // a design target to measure, not a hard rule
}

export const READINESS = ['checking', 'connecting', 'open', 'interested', 'concerned', 'not_now', 'not_fit'] as const;
export const ACTIONS = ['continue', 'deepen', 'skip', 'reroute', 'answer', 'register', 'updates', 'guide', 'end', 'safety'] as const;
export type Readiness = typeof READINESS[number];
export type Gender = 'female' | 'male' | null;
export type Action = typeof ACTIONS[number];

// What the engine learned about this visitor. Only what the visitor said or confirmed goes in `learned`;
// research hypotheses never do (spec chapter 7).
export interface Learned {
  pain?: string;
  desire?: string;
  changeTrigger?: string;
  coping?: string;
  concerns?: string[];
}

export interface SessionState {
  milestone: string;
  done: string[];
  readiness: Readiness;
  action: Action;
  learned: Learned;
  // Saved parameter: how to address the person. Set from the link (the campaign's audience), kept for the whole conversation,
  // and replaced only when the person reveals otherwise (then the source is 'visitor' and the link never overrides it again).
  gender: Gender;
  genderSource: 'link' | 'visitor' | null;
  meta?: { campaign: string; journeyType: string; topicId: string | null; segment: Record<string, unknown>; contentVersionId: string | null; journeyVersion: number };
}

export interface CampaignContext {
  campaign: { id: string; journey_type: string; topic_id: string | null; segment_filters: Record<string, unknown>; creative: Record<string, unknown> };
  journey: { journey_type: string; version: number; definition: unknown } | null;
  content_version_id: string | null;
  profile: { title: string; summary: string | null; evidence: string | null; profile: Record<string, unknown> } | null;
  insights: { id: string; body: string; confidence: string | null }[];
  hypothesis?: string;        // for a campaign that exists only as a legacy ad key
}

export interface JourneyBusiness<Ctx = unknown> {
  key: string;
  botName: string;
  origins: string[];
  testOrigin?: string;
  ageRange: string;
  softTopic?: Record<string, string>;
  painBriefs?: Record<string, string>;
  bioBrief?: string;
  siteOnly?: boolean;                                // meeting details (date, place, price) are never given in the chat: the site has them
  flowPrompt?: string;                               // when set, the whole conversation flow of the business (free stages) replaces the milestone engine
  stageHints?: (turns: number) => string;
  flowReminder?: (a: 'female' | 'male' | 'plural') => string;
  persona: (age: string) => string;                  // tone, hard limits, facts about the offer: never the conversation flow
  adTexts: Record<string, string>;                   // legacy ad keys that stay valid without a campaign row
  adPain: Record<string, string>;
  loadFacts: () => Promise<Ctx | null>;              // live facts (Harpatka: the next meeting)
  factsBlock: (facts: Ctx | null) => string;
  rpc: { usage?: string };
  saltDefault: string;
}
