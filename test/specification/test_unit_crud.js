import test from 'tape'
import { pause } from '@connoropolous/tryorama'
import {
  buildPlayer,
} from '../init.js'

const exampleEntry = {
  label: 'kilgrams',
  symbol: 'kig',
}
const updatedExampleEntry = {
  label: 'kilograms',
  symbol: 'kg',
}

test('Unit record API', async (t) => {
  const alice = await buildPlayer(['specification'])

  let createResp = await alice.graphQL(`
    mutation($rs: UnitCreateParams!) {
      res: createUnit(unit: $rs) {
        unit {
          id
          revisionId
        }
      }
    }
    `, {
    rs: exampleEntry,
  })
  await pause(100)

  t.ok(createResp.data.res.unit.id, 'record created')
  t.equal(createResp.data.res.unit.id.split(':')[0], exampleEntry.symbol, 'record index set')
  let uId = createResp.data.res.unit.id
  let uRevision = createResp.data.res.unit.revisionId
  const getResp = await alice.graphQL(`
    query($id: ID!) {
      res: unit(id: $id) {
        id
        revisionId
        label
        symbol
      }
    }
    `, {
    id: uId,
  })

  t.deepLooseEqual(getResp.data.res, { 'id': uId, revisionId: uRevision, ...exampleEntry }, 'record read OK')

  const updateResp = await alice.graphQL(`
    mutation($rs: UnitUpdateParams!) {
      res: updateUnit(unit: $rs) {
        unit {
          id
          revisionId
        }
      }
    }
    `, {
    rs: { revisionId: uRevision, ...updatedExampleEntry },
  })
  const updatedUnitRevId = updateResp.data.res.unit.revisionId
  await pause(100)

  t.notEqual(updateResp.data.res.unit.id, uId, 'update operation succeeded')
  t.equal(updateResp.data.res.unit.id.split(':')[0], updatedExampleEntry.symbol, 'record index updated')
  uId = updateResp.data.res.unit.id

  // now we fetch the Entry again to check that the update was successful
  const updatedGetResp = await alice.graphQL(`
    query($id: ID!) {
      res: unit(id: $id) {
        id
        revisionId
        label
        symbol
      }
    }
  `, {
    id: uId,
  })

  t.deepLooseEqual(updatedGetResp.data.res, { id: uId, revisionId: updatedUnitRevId, ...updatedExampleEntry }, 'record updated OK')

  const deleteResult = await alice.graphQL(`
    mutation($revisionId: ID!) {
      res: deleteUnit(revisionId: $revisionId)
    }
  `, {
    revisionId: updatedUnitRevId,
  })
  await pause(100)

  t.equal(deleteResult.data.res, true)

  const queryForDeleted = await alice.graphQL(`
    query($id: ID!) {
      res: unit(id: $id) {
        id
        label
        symbol
      }
    }
  `, {
    id: uId,
  })

  t.equal(queryForDeleted.errors.length, 1, 'querying deleted record is an error')
  t.notEqual(-1, queryForDeleted.errors[0].message.indexOf('No entry at this address'), 'correct error reported')

  await alice.scenario.cleanUp()
})
