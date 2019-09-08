const {
  getDNA,
  buildOrchestrator,
} = require('../init')

const runner = buildOrchestrator({
  observation: getDNA('observation'),
  planning: getDNA('planning'),
}, {
  vf_observation: ['planning', 'observation'],
})

runner.registerScenario('updating link fields changes field and associated index', async (s, t, { planning, observation }) => {
  // SCENARIO: write initial records
  const process = {
    name: 'context process for testing relationships',
  }
  const pResp = await observation.call('process', 'create_process', { process })
  t.ok(pResp.Ok.process && pResp.Ok.process.id, 'process created successfully')
  await s.consistent()
  const processId = pResp.Ok.process.id

  const process2 = {
    name: 'second context process for testing relationships',
  }
  const pResp2 = await observation.call('process', 'create_process', { process: process2 })
  t.ok(pResp2.Ok.process && pResp2.Ok.process.id, 'process created successfully')
  await s.consistent()
  const differentProcessId = pResp2.Ok.process.id

  const iEvent = {
    note: 'test input event',
    inputOf: processId,
  }
  const ieResp = await observation.call('economic_event', 'create_event', { event: iEvent })
  t.ok(ieResp.Ok.economicEvent && ieResp.Ok.economicEvent.id, 'input record created successfully')
  t.equal(ieResp.Ok.economicEvent.inputOf, processId, 'field reference OK in write')
  await s.consistent()
  const iEventId = ieResp.Ok.economicEvent.id



  // SCENARIO: update link field
  const updateEvent = {
    id: iEventId,
    inputOf: differentProcessId,
  }
  const ieResp2 = await observation.call('economic_event', 'update_event', { event: updateEvent })
  t.equal(ieResp2.Ok.economicEvent && ieResp2.Ok.economicEvent.inputOf, differentProcessId, 'record link field updated successfully')
  await s.consistent()

  // ASSERT: test event fields
  let readResponse = await observation.call('economic_event', 'get_event', { address: iEventId })
  t.ok(readResponse.Ok.economicEvent && readResponse.Ok.economicEvent.inputOf, 'field reference OK on read')
  t.equal(readResponse.Ok.economicEvent && readResponse.Ok.economicEvent.inputOf, differentProcessId, 'field updated successfully')

  // ASSERT: test process input query edge
  readResponse = await observation.call('process', 'query_processes', { params: { inputs: iEventId } })
  t.equal(readResponse.Ok && readResponse.Ok.length, 1, 'process query index present')
  t.equal(readResponse.Ok[0] && readResponse.Ok[0].process && readResponse.Ok[0].process.id, differentProcessId, 'process query index updated')

  // ASSERT: test event input query edge
  readResponse = await observation.call('economic_event', 'query_events', { params: { inputOf: differentProcessId } })
  t.equal(readResponse.Ok && readResponse.Ok.length, 1, 'field query index present')
  t.equal(readResponse.Ok[0] && readResponse.Ok[0].economicEvent && readResponse.Ok[0].economicEvent.id, iEventId, 'field query index updated')



  // SCENARIO: update link field (no-op)
  const ieResp3 = await observation.call('economic_event', 'update_event', { event: updateEvent })
  t.equal(ieResp3.Ok.economicEvent && ieResp3.Ok.economicEvent.inputOf, differentProcessId, 'update with same fields is no-op')
  await s.consistent()

  // ASSERT: test event fields
  readResponse = await observation.call('economic_event', 'get_event', { address: iEventId })
  t.equal(readResponse.Ok.economicEvent && readResponse.Ok.economicEvent.inputOf, differentProcessId, 'field update no-op OK')



  // SCENARIO: remove link field
  const wipeEventInput = {
    id: iEvent,
    inputOf: null,
  }
  const ieResp4 = await observation.call('economic_event', 'update_event', { event: wipeEventInput })
  t.equal(ieResp4.Ok.economicEvent && ieResp4.Ok.economicEvent.inputOf, null, 'update with null value erases field')
  await s.consistent()

  // ASSERT: test event fields
  readResponse = await observation.call('economic_event', 'get_event', { address: iEventId })
  t.equal(readResponse.Ok.economicEvent && readResponse.Ok.economicEvent.inputOf, null, 'field erased successfully')

  // :TODO: updates for fields with other values in the array
})

// :TODO:
// -

runner.run()
