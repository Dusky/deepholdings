import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import {
  RECRUIT_GRADE_BY_TIER,
  STARTING_GOLD,
  inheritedLevel,
  inheritedPermitTier,
  type Character,
} from '@deepholdings/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { succeed } from '../src/domain/character.js';
import type { Repository } from '../src/ports.js';
import { adapters } from './adapters.js';

const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'test-secret' });

/** Fields that must match between two independently-issued successors. */
function caseFile(character: Character) {
  const { id, accountId, lastResolvedTick, bornTick, ...rest } = character;
  return rest;
}

test('the first recruit of an account is a succession from nobody', () => {
  const first = succeed({
    id: 'c1',
    accountId: 'a1',
    previous: null,
    depthReached: 0,
    unlocks: [],
    atTick: 100,
  });

  assert.equal(first.character.recruitNum, 1);
  assert.equal(first.character.level, 1);
  assert.equal(first.character.permitTier, 1);
  assert.equal(first.character.gold, STARTING_GOLD);
  assert.ok(first.inventory.length > 0, 'a new recruit is issued kit');
  assert.equal(first.permitAppliedTick, null);
});

test('depth is ignored when there is no case file to read it against', () => {
  // A first recruit cannot inherit from a Floor 12 career that never happened.
  const deep = succeed({
    id: 'c1', accountId: 'a1', previous: null, depthReached: 12, unlocks: [], atTick: 0,
  });
  assert.equal(deep.character.level, 1);
});

test('kit is fresh per successor, not a shared array', () => {
  const a = succeed({
    id: 'a', accountId: 'x', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  const b = succeed({
    id: 'b', accountId: 'x', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  a.inventory[0].quantity = 999;
  assert.notEqual(b.inventory[0].quantity, 999, 'successors must not share kit');
});

test('a deep loss returns a better successor than a shallow one', () => {
  const veteran = { recruitNum: 4, permitTier: 6, level: 12 } as Character;
  const shallow = succeed({
    id: 'a', accountId: 'x', previous: veteran, depthReached: 1, unlocks: [], atTick: 0,
  });
  const deep = succeed({
    id: 'b', accountId: 'x', previous: veteran, depthReached: 11, unlocks: [], atTick: 0,
  });

  assert.ok(deep.character.level > shallow.character.level);
  // Both keep the permit ladder: it is issued against the case file.
  assert.equal(shallow.character.permitTier, inheritedPermitTier(6));
  assert.equal(deep.character.permitTier, inheritedPermitTier(6));
  assert.equal(deep.character.recruitNum, 5);
});

test('the intake unlock is a floor, never a ceiling', () => {
  const veteran = { recruitNum: 1, permitTier: 4, level: 12 } as Character;
  // A successor already above the intake grade must not be demoted to it.
  const withIntake = succeed({
    id: 'a', accountId: 'x', previous: veteran, depthReached: 9, unlocks: ['recruit1'], atTick: 0,
  });
  assert.ok(withIntake.character.level >= RECRUIT_GRADE_BY_TIER[1]);
  assert.equal(withIntake.character.level, inheritedLevel(12, 9));

  // And a successor below it is lifted to it.
  const rookie = { recruitNum: 1, permitTier: 1, level: 1 } as Character;
  const lifted = succeed({
    id: 'b', accountId: 'x', previous: rookie, depthReached: 0, unlocks: ['recruit1'], atTick: 0,
  });
  assert.equal(lifted.character.level, RECRUIT_GRADE_BY_TIER[1]);
});

for (const adapter of adapters) {
  describe(`succession agrees with the server (${adapter.name})`, () => {
    let repo!: Repository;
    let app!: ReturnType<typeof buildApp>;
    let token = '';

    before(async () => {
      repo = adapter.make();
      await repo.init();
      app = buildApp({ repo, config });
      const auth = await app.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `succ-${Date.now()}-${Math.random()}` },
      });
      token = auth.json().token;
    });

    after(async () => {
      await app.close();
      await repo.close();
    });

    const auth = () => ({ authorization: `Bearer ${token}` });

    /**
     * The anti-divergence guard.
     *
     * The balance harness and the server used to construct successors
     * independently. Both were individually correct and they disagreed for
     * months: the harness passed the case file, the server did not, so every
     * measurement of what death costs described a game nobody was playing.
     * They share `succeed` now, and this asserts the claim endpoint returns
     * exactly what a direct call produces for the same inputs — so if anyone
     * reintroduces a second construction path, this fails.
     */
    test('the claim endpoint issues exactly what succeed() issues', async () => {
      const state = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      const account = state.json().account.id;

      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      Object.assign(record.character, {
        level: 12, permitTier: 6, depth: 9, hp: 0, alive: false,
      });
      await repo.saveCharacter(record);
      const deceased = { ...record.character };

      await repo.recordDeath(account, {
        id: randomUUID(),
        characterName: deceased.name,
        depth: 9,
        cause: 'the floor, generally',
        goldHandled: 0,
        pensionAwarded: 40,
        at: new Date().toISOString(),
      });

      const claim = await app.inject({
        method: 'POST', url: '/v1/pension/claim', headers: auth(),
      });
      assert.equal(claim.statusCode, 200);

      const expected = succeed({
        id: 'ignored',
        accountId: account,
        previous: deceased,
        depthReached: 9,
        unlocks: [],
        atTick: 0,
      });

      assert.deepEqual(caseFile(claim.json().character), caseFile(expected.character));
    });
  });
}
