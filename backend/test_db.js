import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
  console.log('Checking database tables...')
  
  const { data, error } = await supabase
    .from('ticket_requests')
    .select('*')
    .limit(1)
    
  if (error) {
    console.error('Error fetching ticket_requests:', error)
  } else {
    console.log('Successfully fetched ticket_requests:', data)
    if (data.length > 0) {
      console.log('Columns:', Object.keys(data[0]))
    }
  }

  const { data: invoicesData, error: invoicesError } = await supabase
    .from('invoices')
    .select('*')
    .limit(1)

  if (invoicesError) {
    console.error('Error fetching invoices:', invoicesError)
  } else {
    console.log('Successfully fetched invoices:', invoicesData)
  }
}

run()
