import { LitElement, html } from "lit";
import { customElement, query } from "lit/decorators.js";

import { PlayerType } from "../../../core/game/Game";
import { GameView, PlayerView } from "../../../core/game/GameView";

import quickChatData from "../../../../resources/QuickChat.json";
import { EventBus } from "../../../core/EventBus";
import { SendQuickChatEvent } from "../../Transport";

type QuickChatPhrase = {
  key: string;
  text: string;
  requiresPlayer: boolean;
};

type QuickChatPhrases = Record<string, QuickChatPhrase[]>;

const quickChatPhrases: QuickChatPhrases = quickChatData;

@customElement("chat-modal")
export class ChatModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };

  createRenderRoot() {
    return this;
  }

  private players: string[] = [];

  private playerSearchQuery: string = "";
  private previewText: string | null = null;
  private requiresPlayerSelection: boolean = false;
  private selectedCategory: string | null = null;
  private selectedPhraseText: string | null = null;
  private selectedPlayer: string | null = null;
  private selectedPhraseTemplate: string | null = null;
  private selectedQuickChatKey: string | null = null;

  private recipient: PlayerView;
  private sender: PlayerView;
  public eventBus: EventBus;

  public g: GameView;

  quickChatPhrases: Record<
    string,
    Array<{ text: string; requiresPlayer: boolean }>
  > = {
    help: [{ text: "Please give me troops!", requiresPlayer: false }],
    attack: [{ text: "Attack [P1]!", requiresPlayer: true }],
    defend: [{ text: "Defend [P1]!", requiresPlayer: true }],
    greet: [{ text: "Hello!", requiresPlayer: false }],
    misc: [{ text: "Let's go!", requiresPlayer: false }],
  };

  private categories = [
    { id: "help", name: "Help" },
    { id: "attack", name: "Attack" },
    { id: "defend", name: "Defend" },
    { id: "greet", name: "Greetings" },
    { id: "misc", name: "Miscellaneous" },
    { id: "warnings", name: "Warnings" },
  ];

  private getPhrasesForCategory(categoryId: string) {
    return quickChatPhrases[categoryId] ?? [];
  }

  render() {
    const sortedPlayers = [...this.players].sort((a, b) => a.localeCompare(b));

    const filteredPlayers = sortedPlayers.filter((player) =>
      player.toLowerCase().includes(this.playerSearchQuery),
    );

    const otherPlayers = sortedPlayers.filter(
      (player) => !player.toLowerCase().includes(this.playerSearchQuery),
    );

    const displayPlayers = [...filteredPlayers, ...otherPlayers];
    return html`
      <o-modal title="Quick Chat">
        <div class="chat-columns">
          <div class="chat-column">
            <div class="column-title">Category</div>
            ${this.categories.map(
              (category) => html`
                <button
                  class="chat-option-button ${this.selectedCategory ===
                  category.id
                    ? "selected"
                    : ""}"
                  @click=${() => this.selectCategory(category.id)}
                >
                  ${category.name}
                </button>
              `,
            )}
          </div>

          ${this.selectedCategory
            ? html`
                <div class="chat-column">
                  <div class="column-title">Phrase</div>
                  <div class="phrase-scroll-area">
                    ${this.getPhrasesForCategory(this.selectedCategory).map(
                      (phrase) => html`
                        <button
                          class="chat-option-button ${this
                            .selectedPhraseText === phrase.text
                            ? "selected"
                            : ""}"
                          @click=${() => this.selectPhrase(phrase)}
                        >
                          ${this.renderPhrasePreview(phrase)}
                        </button>
                      `,
                    )}
                  </div>
                </div>
              `
            : null}
          ${this.requiresPlayerSelection || this.selectedPlayer
            ? html`
                <div class="chat-column">
                  <div class="column-title">Player</div>

                  <input
                    class="player-search-input"
                    type="text"
                    placeholder="Search player..."
                    .value=${this.playerSearchQuery}
                    @input=${this.onPlayerSearchInput}
                  />

                  <div class="player-scroll-area">
                    ${this.getSortedFilteredPlayers().map(
                      (player) => html`
                        <button
                          class="chat-option-button ${this.selectedPlayer ===
                          player
                            ? "selected"
                            : ""}"
                          @click=${() => this.selectPlayer(player)}
                        >
                          ${player}
                        </button>
                      `,
                    )}
                  </div>
                </div>
              `
            : null}
        </div>

        <div class="chat-preview">
          ${this.previewText || "Build your message..."}
        </div>
        <div class="chat-send">
          <button
            class="chat-send-button"
            @click=${this.sendChatMessage}
            ?disabled=${!this.previewText}
          >
            Send
          </button>
        </div>
      </o-modal>
    `;
  }

  private selectCategory(categoryId: string) {
    this.selectedCategory = categoryId;
    this.selectedPhraseText = null;
    this.previewText = null;
    this.requiresPlayerSelection = false;
    this.selectedPlayer = null;
    this.requestUpdate();
  }

  private selectPhrase(phrase: QuickChatPhrase) {
    this.selectedPhraseTemplate = phrase.text;
    this.selectedPhraseText = phrase.text;
    this.selectedQuickChatKey = this.getFullQuickChatKey(
      this.selectedCategory!,
      phrase.key,
    );
    this.previewText = phrase.text;
    this.requiresPlayerSelection = phrase.requiresPlayer;
    this.selectedPlayer = null;
    this.requestUpdate();
  }

  private renderPhrasePreview(phrase: { text: string }) {
    return phrase.text.replace("[P1]", "___"); // 仮表示
  }

  private selectPlayer(player: string) {
    if (this.previewText) {
      this.previewText = this.selectedPhraseTemplate.replace("[P1]", player);
      this.selectedPlayer = player;
      this.requiresPlayerSelection = false;
      this.requestUpdate();
    }
  }

  private sendChatMessage() {
    console.log("Sent message:", this.previewText);
    console.log("Sender:", this.sender);
    console.log("Recipient:", this.recipient);
    console.log("Key:", this.selectedQuickChatKey);

    if (this.sender && this.recipient && this.selectedQuickChatKey) {
      const variables = this.selectedPlayer ? { P1: this.selectedPlayer } : {};

      this.eventBus.emit(
        new SendQuickChatEvent(
          this.sender,
          this.recipient,
          this.selectedQuickChatKey,
          variables,
        ),
      );
    }

    this.previewText = null;
    this.selectedCategory = null;
    this.requiresPlayerSelection = false;
    this.close();

    this.requestUpdate();
  }

  private onPlayerSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    this.playerSearchQuery = target.value.toLowerCase();
    this.requestUpdate();
  }

  private getSortedFilteredPlayers(): string[] {
    const sorted = [...this.players].sort((a, b) => a.localeCompare(b));
    const filtered = sorted.filter((p) =>
      p.toLowerCase().includes(this.playerSearchQuery),
    );
    const others = sorted.filter(
      (p) => !p.toLowerCase().includes(this.playerSearchQuery),
    );
    return [...filtered, ...others];
  }

  private getFullQuickChatKey(category: string, phraseKey: string): string {
    return `${category}.${phraseKey}`;
  }

  public open(sender?: PlayerView, recipient?: PlayerView) {
    if (sender && recipient) {
      console.log("Sent message:", recipient);
      console.log("Sent message:", sender);
      const alivePlayerNames = this.g
        .players()
        .filter((p) => p.isAlive() && !(p.data.playerType === PlayerType.Bot))
        .map((p) => p.data.name);

      console.log("Alive player names:", alivePlayerNames);
      this.players = alivePlayerNames;
      this.recipient = recipient;
      this.sender = sender;
    }
    this.modalEl?.open();
  }

  public close() {
    this.selectedCategory = null;
    this.selectedPhraseText = null;
    this.previewText = null;
    this.requiresPlayerSelection = false;
    this.selectedPlayer = null;
    this.modalEl?.close();
  }

  public setRecipient(value: PlayerView) {
    this.recipient = value;
  }

  public setSender(value: PlayerView) {
    this.sender = value;
  }
}
