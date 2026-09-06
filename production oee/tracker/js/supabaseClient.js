// Supabase Client Manager with LocalStorage Offline Fallback
// Provides transparent switching between live Supabase DB and local storage
import { SUPABASE_CONFIG } from './config.js';

const STORAGE_KEY_CONFIG = 'prod_tracker_supabase_config';
const STORAGE_KEY_LOCAL_ENTRIES = 'prod_tracker_local_entries';

class SupabaseService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.url = '';
    this.anonKey = '';
    this.initFromStorage();
  }

  initFromStorage() {
    try {
      // Priority 1: Check config.js for hardcoded credentials
      if (SUPABASE_CONFIG && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
        this.configure(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, false);
        return;
      }

      // Priority 2: Check localStorage
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.url && parsed.anonKey) {
          this.configure(parsed.url, parsed.anonKey, false);
        }
      }
    } catch (e) {
      console.warn('Could not parse saved Supabase config', e);
    }
  }

  configure(url, anonKey, persist = true) {
    this.url = (url || '').trim();
    this.anonKey = (anonKey || '').trim();

    if (persist) {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({
        url: this.url,
        anonKey: this.anonKey
      }));
    }

    if (this.url && this.anonKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.url, this.anonKey);
        this.isConnected = true;
        return true;
      } catch (err) {
        console.error('Failed to create Supabase client', err);
        this.client = null;
        this.isConnected = false;
        return false;
      }
    } else {
      this.client = null;
      this.isConnected = false;
      return false;
    }
  }

  getConfig() {
    return {
      url: this.url,
      anonKey: this.anonKey,
      isConnected: this.isConnected && !!this.client
    };
  }

  async testConnection() {
    if (!this.client) {
      return { success: false, message: 'No Supabase credentials configured. Running in Local Mode.' };
    }
    try {
      // Test querying the machines table or production_entries table
      const { data, error } = await this.client
        .from('machines')
        .select('code, name')
        .limit(1);

      if (error) {
        // Fallback test: ping production_entries
        const res2 = await this.client.from('production_entries').select('id').limit(1);
        if (res2.error) {
          return { success: false, message: `Database responded with error: ${res2.error.message}` };
        }
      }
      this.isConnected = true;
      return { success: true, message: 'Connected to Supabase successfully!' };
    } catch (err) {
      this.isConnected = false;
      return { success: false, message: `Connection failed: ${err.message}` };
    }
  }

  async saveEntry(entry) {
    // Generate standard client ID and timestamp
    const cleanEntry = {
      ...entry,
      created_at: new Date().toISOString()
    };

    // Always keep a local copy for resilience & immediate UI response
    this.saveToLocal(cleanEntry);

    if (this.client) {
      try {
        const { data, error } = await this.client
          .from('production_entries')
          .insert([entry])
          .select();

        if (error) {
          console.error('Supabase insert error:', error);
          return {
            success: true,
            storage: 'local_fallback',
            message: `Saved locally (Supabase error: ${error.message})`,
            data: cleanEntry
          };
        }

        return {
          success: true,
          storage: 'supabase',
          message: 'Saved to Supabase database successfully!',
          data: data?.[0] || cleanEntry
        };
      } catch (err) {
        console.error('Supabase exception:', err);
        return {
          success: true,
          storage: 'local_fallback',
          message: `Saved locally (${err.message})`,
          data: cleanEntry
        };
      }
    }

    return {
      success: true,
      storage: 'local',
      message: 'Saved locally in browser storage.',
      data: cleanEntry
    };
  }

  async fetchEntries(limit = 100) {
    if (this.client) {
      try {
        const { data, error } = await this.client
          .from('production_entries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && Array.isArray(data)) {
          // Merge with any unsynced local entries
          return data;
        }
      } catch (err) {
        console.warn('Error fetching from Supabase, falling back to local storage', err);
      }
    }
    return this.getLocalEntries();
  }

  saveToLocal(entry) {
    const list = this.getLocalEntries();
    // Add unique local ID if missing
    if (!entry.id) {
      entry.id = 'local-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    }
    list.unshift(entry);
    // Keep up to 500 entries locally
    localStorage.setItem(STORAGE_KEY_LOCAL_ENTRIES, JSON.stringify(list.slice(0, 500)));
  }

  getLocalEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LOCAL_ENTRIES);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  clearLocalEntries() {
    localStorage.removeItem(STORAGE_KEY_LOCAL_ENTRIES);
  }
}

export const db = new SupabaseService();
