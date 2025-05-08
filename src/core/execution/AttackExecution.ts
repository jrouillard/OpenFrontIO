import { PriorityQueue } from "@datastructures-js/priority-queue";
import { renderNumber, renderTroops } from "../../client/Utils";
import {
  Attack,
  Execution,
  Game,
  MessageType,
  Player,
  PlayerID,
  PlayerType,
  TerrainType,
  TerraNullius,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";

const malusForRetreat = 25;

export class AttackExecution implements Execution {
  private breakAlliance = false;
  private active: boolean = true;
  private toConquer: PriorityQueue<TileContainer> =
    new PriorityQueue<TileContainer>((a: TileContainer, b: TileContainer) => {
      return a.priority - b.priority;
    });
  private random = new PseudoRandom(123);

  private _owner: Player;
  private target: Player | TerraNullius;

  private mg: Game;

  private border = new Set<TileRef>();

  private attack: Attack = null;

  constructor(
    private startTroops: number | null = null,
    private _ownerID: PlayerID,
    private _targetID: PlayerID | null,
    private sourceTile: TileRef | null = null,
    private removeTroops: boolean = true,
  ) {}

  public targetID(): PlayerID {
    return this._targetID;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number) {
    if (!this.active) {
      return;
    }
    this.mg = mg;

    if (!mg.hasPlayer(this._ownerID)) {
      console.warn(`player ${this._ownerID} not found`);
      this.active = false;
      return;
    }
    if (this._targetID != null && !mg.hasPlayer(this._targetID)) {
      console.warn(`target ${this._targetID} not found`);
      this.active = false;
      return;
    }

    this._owner = mg.player(this._ownerID);
    this.target =
      this._targetID == this.mg.terraNullius().id()
        ? mg.terraNullius()
        : mg.player(this._targetID);

    if (this.target && this.target.isPlayer()) {
      const targetPlayer = this.target as Player;
      if (
        targetPlayer.type() != PlayerType.Bot &&
        this._owner.type() != PlayerType.Bot
      ) {
        // Don't let bots embargo since they can't trade anyways.
        targetPlayer.addEmbargo(this._owner.id());
      }
    }

    if (this._owner == this.target) {
      console.error(`Player ${this._owner} cannot attack itself`);
      this.active = false;
      return;
    }

    if (
      this.target.isPlayer() &&
      this.mg.config().numSpawnPhaseTurns() +
        this.mg.config().spawnImmunityDuration() >
        this.mg.ticks()
    ) {
      console.warn("cannot attack player during immunity phase");
      this.active = false;
      return;
    }

    if (this.startTroops == null) {
      this.startTroops = this.mg
        .config()
        .attackAmount(this._owner, this.target);
    }
    if (this.removeTroops) {
      this.startTroops = Math.min(this._owner.troops(), this.startTroops);
      this._owner.removeTroops(this.startTroops);
    }
    this.attack = this._owner.createAttack(
      this.target,
      this.startTroops,
      this.sourceTile,
    );

    for (const incoming of this._owner.incomingAttacks()) {
      if (incoming.attacker() == this.target) {
        // Target has opposing attack, cancel them out
        if (incoming.troops() > this.attack.troops()) {
          incoming.setTroops(incoming.troops() - this.attack.troops());
          this.attack.delete();
          this.active = false;
          return;
        } else {
          this.attack.setTroops(this.attack.troops() - incoming.troops());
          incoming.delete();
        }
      }
    }
    for (const outgoing of this._owner.outgoingAttacks()) {
      if (
        outgoing != this.attack &&
        outgoing.target() == this.attack.target() &&
        outgoing.sourceTile() == this.attack.sourceTile()
      ) {
        // Existing attack on same target, add troops
        outgoing.setTroops(outgoing.troops() + this.attack.troops());
        this.active = false;
        this.attack.delete();
        return;
      }
    }

    if (this.sourceTile != null) {
      this.addNeighbors(this.sourceTile);
    } else {
      this.refreshToConquer();
    }

    if (this.target.isPlayer()) {
      if (this._owner.isAlliedWith(this.target)) {
        // No updates should happen in init.
        this.breakAlliance = true;
      }
      this.target.updateRelation(this._owner, -80);
    }
  }

  private refreshToConquer() {
    this.toConquer.clear();
    this.border.clear();
    for (const tile of this._owner.borderTiles()) {
      this.addNeighbors(tile);
    }
  }

  private retreat(malusPercent = 0) {
    const deaths = this.attack.troops() * (malusPercent / 100);
    if (deaths) {
      this.mg.displayMessage(
        `Attack cancelled, ${renderTroops(deaths)} soldiers killed during retreat.`,
        MessageType.SUCCESS,
        this._owner.id(),
      );
    }
    this._owner.addTroops(this.attack.troops() - deaths);
    this.attack.delete();
    this.active = false;
  }

  tick(ticks: number) {
    if (this.attack.retreated()) {
      if (this.attack.target().isPlayer()) {
        this.retreat(malusForRetreat);
      } else {
        this.retreat();
      }
      this.active = false;
      return;
    }

    if (this.attack.retreating()) {
      return;
    }

    if (!this.attack.isActive()) {
      this.active = false;
      return;
    }

    const alliance = this._owner.allianceWith(this.target as Player);
    if (this.breakAlliance && alliance != null) {
      this.breakAlliance = false;
      this._owner.breakAlliance(alliance);
    }
    if (this.target.isPlayer() && this._owner.isAlliedWith(this.target)) {
      // In this case a new alliance was created AFTER the attack started.
      this.retreat();
      return;
    }

    let numTilesPerTick = this.mg
      .config()
      .attackTilesPerTick(
        this.attack.troops(),
        this._owner,
        this.target,
        this.border.size + this.random.nextInt(0, 5),
      );

    while (numTilesPerTick > 0) {
      if (this.attack.troops() < 1) {
        this.attack.delete();
        this.active = false;
        return;
      }

      if (this.toConquer.size() == 0) {
        this.refreshToConquer();
        this.retreat();
        return;
      }

      const tileToConquer = this.toConquer.dequeue().tile;
      this.border.delete(tileToConquer);

      const onBorder =
        this.mg
          .neighbors(tileToConquer)
          .filter((t) => this.mg.owner(t) == this._owner).length > 0;
      if (this.mg.owner(tileToConquer) != this.target || !onBorder) {
        continue;
      }
      this.addNeighbors(tileToConquer);
      const { attackerTroopLoss, defenderTroopLoss, tilesPerTickUsed } = this.mg
        .config()
        .attackLogic(
          this.mg,
          this.attack.troops(),
          this._owner,
          this.target,
          tileToConquer,
        );
      numTilesPerTick -= tilesPerTickUsed;
      this.attack.setTroops(this.attack.troops() - attackerTroopLoss);
      if (this.target.isPlayer()) {
        this.target.removeTroops(defenderTroopLoss);
      }
      this._owner.conquer(tileToConquer);
      this.handleDeadDefender();
    }
  }

  private addNeighbors(tile: TileRef) {
    for (const neighbor of this.mg.neighbors(tile)) {
      if (this.mg.isWater(neighbor) || this.mg.owner(neighbor) != this.target) {
        continue;
      }
      this.border.add(neighbor);
      const numOwnedByMe = this.mg
        .neighbors(neighbor)
        .filter((t) => this.mg.owner(t) == this._owner).length;
      let mag = 0;
      switch (this.mg.terrainType(tile)) {
        case TerrainType.Plains:
          mag = 1;
          break;
        case TerrainType.Highland:
          mag = 1.5;
          break;
        case TerrainType.Mountain:
          mag = 2;
          break;
      }
      this.toConquer.enqueue(
        new TileContainer(
          neighbor,
          (this.random.nextInt(0, 7) + 10) *
            (1 - numOwnedByMe * 0.5 + mag / 2) +
            this.mg.ticks(),
        ),
      );
    }
  }

  private handleDeadDefender() {
    if (!(this.target.isPlayer() && this.target.numTilesOwned() < 100)) return;

    const gold = this.target.gold();
    this.mg.displayMessage(
      `Conquered ${this.target.displayName()} received ${renderNumber(
        gold,
      )} gold`,
      MessageType.SUCCESS,
      this._owner.id(),
    );
    this.target.removeGold(gold);
    this._owner.addGold(gold);

    for (let i = 0; i < 10; i++) {
      for (const tile of this.target.tiles()) {
        const borders = this.mg
          .neighbors(tile)
          .some((t) => this.mg.owner(t) == this._owner);
        if (borders) {
          this._owner.conquer(tile);
        } else {
          for (const neighbor of this.mg.neighbors(tile)) {
            const no = this.mg.owner(neighbor);
            if (no.isPlayer() && no != this.target) {
              this.mg.player(no.id()).conquer(tile);
              break;
            }
          }
        }
      }
    }
  }

  owner(): Player {
    return this._owner;
  }

  isActive(): boolean {
    return this.active;
  }
}

class TileContainer {
  constructor(
    public readonly tile: TileRef,
    public readonly priority: number,
  ) {}
}
