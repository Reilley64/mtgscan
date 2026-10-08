import { createClient } from '@supabase/supabase-js'
import { projectUrl, readLocalJson, readOwnerLogin } from './lib.mjs'

const { publishableKey } = readLocalJson('config.json')
const client = createClient(projectUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { error: signInError } = await client.auth.signInWithPassword(readOwnerLogin())
if (signInError) throw signInError
const decks = await client.from('decks').delete().not('id', 'is', null).select('id')
if (decks.error) throw decks.error
const cards = await client.from('collection_cards').delete().not('id', 'is', null).select('id')
if (cards.error) throw cards.error
const { data, error } = await client.rpc('seed_spike_data')
if (error) throw error
console.log(`Deleted ${decks.data.length} decks and ${cards.data.length} collection rows. Seed: ${JSON.stringify(data)}`)
