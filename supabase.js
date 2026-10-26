const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let supabaseClient = null;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || 'https://vumerporrumovowyonfj.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  return { url, key, isConfigured: Boolean(url && key) };
}

function getSupabaseClient() {
  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false }
    });
  }
  return supabaseClient;
}

async function testSupabaseConnection(url, key) {
  try {
    const testClient = createClient(url, key, {
      auth: { persistSession: false }
    });
    // Try to query filiales or profiles
    const { data, error } = await testClient.from('filiales').select('count', { count: 'exact', head: true });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, count: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getSupabaseConfig,
  getSupabaseClient,
  testSupabaseConnection
};
