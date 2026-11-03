// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent, type ModelMatrix } from '../store/useAgent';
import { useUi } from '../store/useUi';
import { answerChoice, applyColorCard } from './cards';
import { createSavedProject, readSavedProject, deleteSavedProject } from '../persist/save';
import { DIRECTION_PALETTES } from '../design/palettes';
import { stripHexes } from './typedOptions';

/*
 * The swatches are content, not chrome, so they come from the palette table
 * rather than being pasted here: `check:tokens` refuses raw hex in source, and
 * a test that invents its own colours would prove nothing about the ones the
 * product actually ships.
 */
const LOOK = DIRECTION_PALETTES[1]; // Deep focus — indigo / violet
const OTHER = DIRECTION_PALETTES[3]; // Paper & ink
const BRAND = LOOK.hexes[0];
const SECONDARY = LOOK.hexes[1];
const OTHER_HEX = OTHER.hexes[0];

/**
 * The loop this file exists for, seen in the wild:
 *
 *   muse offers "Museware Default Blue" → the user taps it → muse thanks them
 *   and offers directions again → the user taps again → …
 *
 * Two causes. `history()` replays prose only, so a tap reached the model as a
 * bare line with no memory of the card it answered; and nothing in the app
 * applied the palette the user had chosen, so the choice had no visible
 * consequence and asking again cost nothing.
 *
 * Now: a tap applies its swatches itself, the turn carries a PICK RECEIPT, and
 * a second card in that same turn is refused outright.
 */

const MODELS: ModelMatrix = {
  builder: { id: 'muse-spark-1.3', role: 'Builder', effort: 'high' },
  architect: { id: 'muse-wonder-1.0', role: 'Architect', effort: 'max' },
  chat: { id: 'muse-spark-1.3', role: 'Chat', effort: 'low' },
  contributor: { id: 'muse-spark-1.3-contributor', role: 'Dev', effort: 'xhigh' },
  image: { id: 'muse-image-1.0', role: 'Image', effort: null },
  voice: { id: 'muse-voice-transcribe-1.0', role: 'Voice', effort: null },
};

/** One SSE frame carrying a tool call, which is how ask_choice arrives. */
function sseTool(name: string, args: Record<string, unknown>): Response {
  const body = [
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          finish_reason: 'tool_calls',
          index: 0,
        },
      ],
    })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function sseText(text: string): Response {
  const body = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text }, index: 0 }] })}`,
    '',
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const sent: Array<{ messages: Array<{ role: string; content: string }> }> = [];

function stubResponses(...responses: Response[]) {
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body || '{}')));
      const next = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return Promise.resolve(next);
    }),
  );
}

/** A pending look-choice card, exactly as `ask_choice` leaves one. */
function addChoiceCard(
  question: string,
  options: Array<{ label: string; hexes?: string[]; note?: string }>,
) {
  useProject.getState().addRail({
    role: 'card',
    text: question,
    card: { kind: 'choice', state: 'pending', data: { question, options, source: 'tool' } },
  });
  const rail = useProject.getState().doc.rail;
  return rail[rail.length - 1].id;
}

beforeEach(() => {
  useProject.getState().replaceDoc(createProject('Choice'));
  useAgent.setState({
    busy: false,
    stopping: false,
    demoMode: false,
    configured: true,
    keySource: 'env',
    models: MODELS,
    wonder: false,
    contributorMode: false,
    pendingRetry: null,
    receipts: [],
    liveText: '',
    liveLine: null,
    verification: 'idle',
    lastError: null,
    sessionCents: 0,
    sessionRequests: 0,
  });
  useUi.setState({ activeScreenId: null, selectedId: null, route: 'editor' });
  sent.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a tapped choice is a decision, not a new request', () => {
  it('repaints the canvas with the swatches the user actually saw', async () => {
    stubResponses(sseText('Blueprint next.'));
    const cardId = addChoiceCard('Which look?', [
      { label: LOOK.label, hexes: [BRAND, SECONDARY] },
      { label: OTHER.label, hexes: [OTHER_HEX] },
    ]);

    await answerChoice(cardId, 0);

    const theme = useProject.getState().doc.tokens.openuiTheme;
    expect(theme.brand_color).toBe(BRAND);
    expect(theme.secondary_color).toBe(SECONDARY);
    expect(useProject.getState().doc.themeLibrary).toHaveLength(1);
    expect(useProject.getState().doc.themeLibrary![0].theme).toEqual(theme);
    // And it is in the receipt log, not just inferred.
    const rail = useProject.getState().doc.rail;
    expect(rail.some((r) => r.role === 'system' && r.text.includes(BRAND))).toBe(true);
  });

  it('creates a coherent system from a fresh direction and can undo it', async () => {
    stubResponses(sseText('Blueprint next.'));
    const before = structuredClone(useProject.getState().doc.tokens);
    const cardId = addChoiceCard('Which look?', [
      { label: LOOK.label, hexes: [...LOOK.hexes] },
    ]);
    await answerChoice(cardId, 0);
    const theme = useProject.getState().doc.tokens.openuiTheme;
    expect(theme.light_colors.openui_accent).toBe(BRAND);
    expect(theme.light_colors.openui_accent_subtle).not.toBe(
      before.openuiTheme.light_colors.openui_accent_subtle,
    );
    expect(theme.dark_colors.openui_bg).not.toBe(before.openuiTheme.dark_colors.openui_bg);
    expect(useProject.getState().undo()).toBe('undo');
    expect(useProject.getState().doc.tokens).toEqual(before);
  });

  it('updates explicitly chosen accents while preserving other customized settings and blocking agent re-theme', async () => {
    stubResponses(
      sseTool('set_design_tokens', { patch: { brand_color: BRAND } }),
      sseText('Blueprint next.'),
    );
    const doc = createProject('Custom');
    doc.tokens.openuiTheme.light_colors.openui_bg = OTHER.hexes[2];
    useProject.getState().replaceDoc(doc);
    const before = structuredClone(doc.tokens);
    const cardId = addChoiceCard('Which look?', [
      { label: LOOK.label, hexes: [...LOOK.hexes] },
    ]);
    await answerChoice(cardId, 0);
    const after = useProject.getState().doc.tokens;
    expect(after.openuiTheme.brand_color).toBe(BRAND);
    expect(after.openuiTheme.light_colors.openui_bg).toBe(
      before.openuiTheme.light_colors.openui_bg,
    );
    expect(after.openuiTheme.dark_colors.openui_bg).toBe(
      before.openuiTheme.dark_colors.openui_bg,
    );
    expect(after.openuiTheme.radii_dp).toEqual(before.openuiTheme.radii_dp);
    expect(sent[1].messages.find((message) => message.role === 'tool')?.content).toContain(
      'E_THEME_PROTECTED',
    );
    expect(
      useProject
        .getState()
        .doc.rail.some((r) =>
          r.text.includes('existing surfaces and other design settings kept'),
        ),
    ).toBe(true);
    expect(sent[0].messages.map((m) => m.content).join(' ')).not.toContain(
      'A starter colour system was applied',
    );
  });

  it('tells the model what was decided, so it cannot ask for it again', async () => {
    stubResponses(sseText('Blueprint next.'));
    const cardId = addChoiceCard('Which look?', [
      { label: LOOK.label, hexes: [BRAND, SECONDARY] },
    ]);

    await answerChoice(cardId, 0);

    const systemText = sent[0].messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    expect(systemText).toContain('PICK RECEIPT');
    expect(systemText).toContain(LOOK.label);
    expect(systemText).toContain('DECIDED ALREADY');
    expect(systemText).toContain(`brand ${BRAND}`);
  });

  it('refuses a second card in the same turn and pushes the model to a blueprint', async () => {
    stubResponses(
      sseTool('ask_choice', {
        question: 'Which Blue look should I lock in?',
        options: [
          { label: 'Deep Navy Blues', hexes: [BRAND] },
          { label: 'Sky Bright Blues', hexes: [OTHER_HEX] },
        ],
      }),
      sseText('Blueprint next.'),
    );
    const cardId = addChoiceCard('Which look?', [
      { label: LOOK.label, hexes: [BRAND, SECONDARY] },
      { label: OTHER.label, hexes: [OTHER_HEX] },
    ]);

    await answerChoice(cardId, 0);

    const cards = useProject
      .getState()
      .doc.rail.filter((entry) => entry.card?.kind === 'choice');
    expect(cards).toHaveLength(1);
    expect(cards[0].card?.state).toBe('answered');

    // The refusal went back to the model as a tool result, with instructions.
    const toolResult = sent[1].messages.find((m) => m.role === 'tool');
    expect(toolResult?.content).toContain('E_CHOICE_REPEAT');
    expect(toolResult?.content).toContain('propose_blueprint');
  });

  it('carries the extra swatches and note as cues without assigning their roles', async () => {
    stubResponses(sseText('Blueprint next.'));
    const cardId = addChoiceCard('Which look?', [
      { label: LOOK.label, hexes: [...LOOK.hexes], note: 'quiet editorial' },
    ]);
    await answerChoice(cardId, 0);
    const systemText = sent[0].messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join(' ');
    expect(systemText).toContain(LOOK.hexes[2]);
    expect(systemText).toContain(LOOK.hexes[3]);
    expect(systemText).toContain('quiet editorial');
    expect(systemText).toContain('no assigned token roles');
  });

  it('saves and reloads a chosen system without changing it', async () => {
    stubResponses(sseText('Blueprint next.'));
    const cardId = addChoiceCard('Which look?', [
      { label: LOOK.label, hexes: [BRAND, SECONDARY] },
    ]);
    await answerChoice(cardId, 0);
    const doc = useProject.getState().doc;
    const id = await createSavedProject(doc);
    try {
      const loaded = await readSavedProject(id);
      expect(loaded?.tokens).toEqual(doc.tokens);
    } finally {
      await deleteSavedProject(id);
    }
  });

  it('the global colour card creates a system on an untouched project', async () => {
    const before = structuredClone(useProject.getState().doc.tokens);
    await applyColorCard(BRAND, 'everywhere');
    const theme = useProject.getState().doc.tokens.openuiTheme;
    expect(theme.brand_color).toBe(BRAND);
    expect(theme.light_colors.openui_accent_subtle).not.toBe(
      before.openuiTheme.light_colors.openui_accent_subtle,
    );
    useProject.getState().undo();
    expect(useProject.getState().doc.tokens).toEqual(before);
  });

  it('uses one swatch for an intentional monochrome direction', async () => {
    stubResponses(sseText('Blueprint next.'));
    const cardId = addChoiceCard('Which look?', [
      { label: OTHER.label, hexes: [OTHER_HEX] },
    ]);
    await answerChoice(cardId, 0);
    const theme = useProject.getState().doc.tokens.openuiTheme;
    expect(theme.brand_color).toBe(OTHER_HEX);
    expect(theme.secondary_color).toBe(OTHER_HEX);
  });

  it('does not turn typed directions after a tap into a second card either', async () => {
    stubResponses(
      sseText(
        'Which look should I lock in?\n\n' +
          `1. ${stripHexes(LOOK.label)} — ${BRAND} ${SECONDARY}\n` +
          `2. ${stripHexes(OTHER.label)} — ${OTHER_HEX}`,
      ),
      sseText('Blueprint next.'),
    );
    const cardId = addChoiceCard('Which look?', [
      { label: LOOK.label, hexes: [BRAND, SECONDARY] },
      { label: OTHER.label, hexes: [OTHER_HEX] },
    ]);

    await answerChoice(cardId, 0);

    const cards = useProject
      .getState()
      .doc.rail.filter((entry) => entry.card?.kind === 'choice');
    expect(cards).toHaveLength(1);
  });

  it('still lets an ordinary turn ask a question — the guard is only for taps', async () => {
    stubResponses(
      sseTool('ask_choice', {
        question: 'Which look?',
        options: [
          { label: LOOK.label, hexes: [BRAND] },
          { label: OTHER.label, hexes: [OTHER_HEX] },
        ],
      }),
    );

    const { runAgentTurn } = await import('./loop');
    await runAgentTurn('design a coffee shop app');

    const cards = useProject
      .getState()
      .doc.rail.filter((entry) => entry.card?.kind === 'choice');
    expect(cards).toHaveLength(1);
    expect(cards[0].card?.state).toBe('pending');
  });
});

describe('a greeting cannot start the design flow', () => {
  it('recognises greetings, and only when that is the whole message', async () => {
    const { isSmallTalk } = await import('./loop');
    expect(isSmallTalk('Hello')).toBe(true);
    expect(isSmallTalk('  hi! ')).toBe(true);
    expect(isSmallTalk('good morning')).toBe(true);
    expect(isSmallTalk('hello, build me a coffee shop app')).toBe(false);
    expect(isSmallTalk('build me an app')).toBe(false);
  });

  it('drops a look card the model tries to open on "Hello"', async () => {
    stubResponses(
      sseTool('ask_choice', {
        question: 'Which look?',
        options: [
          { label: LOOK.label, hexes: [BRAND] },
          { label: OTHER.label, hexes: [OTHER_HEX] },
        ],
      }),
      sseText('Hi — say the word and I will plan the app with you.'),
    );

    const { runAgentTurn } = await import('./loop');
    await runAgentTurn('Hello');

    const cards = useProject
      .getState()
      .doc.rail.filter((entry) => entry.card?.kind === 'choice');
    expect(cards).toHaveLength(0);
    const toolResult = sent[1].messages.find((m) => m.role === 'tool');
    expect(toolResult?.content).toContain('E_SMALL_TALK');
  });
});
