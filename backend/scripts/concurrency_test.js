import supabaseAdmin from '../lib/supabase.js'

// Usage: node backend/scripts/concurrency_test.js <event_id> <tier_name> <user_id> <parallel>
// Example: node backend/scripts/concurrency_test.js 11111111-1111-1111-1111-111111111111 "Regular" 22222222-2222-2222-2222-222222222222 10

const [,, eventId, tierName, userId, parallel = '10'] = process.argv
if (!eventId || !tierName || !userId) {
	console.error('Usage: node concurrency_test.js <event_id> <tier_name> <user_id> [parallel]')
	process.exit(1)
}

async function run() {
	const n = parseInt(parallel, 10)
	console.log(`Running ${n} concurrent reserve RPC calls for ${tierName} on event ${eventId}`)

	const promises = []
	for (let i = 0; i < n; i++) {
		promises.push(supabaseAdmin.rpc('reserve_ticket_requests', {
			_event_id: eventId,
			_tier_name: tierName,
			_user_id: userId,
			_quantity: 1
		}))
	}

	const results = await Promise.allSettled(promises)
	results.forEach((r, idx) => {
		if (r.status === 'fulfilled') {
			console.log(`#${idx} fulfilled:`, r.value.data ? (Array.isArray(r.value.data) ? `${r.value.data.length} rows` : '1 row') : 'no data')
		} else {
			console.log(`#${idx} rejected:`, r.reason?.message || JSON.stringify(r.reason))
		}
	})
}

run().catch(e => console.error(e))
