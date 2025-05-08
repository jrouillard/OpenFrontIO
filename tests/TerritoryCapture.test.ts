import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

describe("Territory management", () => {
  test("player owns the tile it spawns on", async () => {
    const game = await setup("Plains");
    game.addPlayer(
      new PlayerInfo("us", "test_player", PlayerType.Human, null, "test_id"),
    );
    const spawnTile = game.map().ref(50, 50);
    game.addExecution(
      new SpawnExecution(game.player("test_id").info(), spawnTile),
    );
    // Init the execution
    game.executeNextTick();
    // Execute the execution.
    game.executeNextTick();

    const owner = game.owner(spawnTile);
    expect(owner.isPlayer()).toBe(true);
    expect((owner as Player).name()).toBe("test_player");
  });
});
