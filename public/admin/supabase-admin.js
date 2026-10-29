/* Supabase-backed login, dashboard and CRM for the static admin portal.
 * The publishable key is intentionally public; authorization is enforced by RLS.
 * CRM tables and policies are installed with supabase/crm.sql. */
(function (root) {
  'use strict';

  const CRM_STAGES = ['nouveau', 'qualification', 'contacte', 'reunion', 'proposition', 'negociation', 'gagne', 'perdu'];
  const CRM_STAGE_LABELS = {
    nouveau: 'Nouveau',
    qualification: 'Qualification',
    contacte: 'Contacté',
    reunion: 'Réunion',
    proposition: 'Proposition',
    negociation: 'Négociation',
    gagne: 'Gagné',
    perdu: 'Perdu'
  };
  const CRM_CONTACT_TYPE_LABELS = {
    prospect: 'Prospect',
    client: 'Client',
    partenaire: 'Partenaire',
    investisseur: 'Investisseur',
    porteur_projet: 'Porteur de projet',
    candidat: 'Candidat',
    autre: 'Autre'
  };
  const CRM_CONTACT_STATUS_LABELS = { nouveau: 'Nouveau', actif: 'Actif', inactif: 'Inactif', archive: 'Archivé' };
  const CRM_OPPORTUNITY_TYPE_LABELS = {
    commerciale: 'Commerciale',
    investissement: 'Investissement',
    partenariat: 'Partenariat',
    appel_projet: 'Appel à projets',
    recrutement: 'Recrutement',
    autre: 'Autre'
  };
  const CRM_ACTIVITY_TYPE_LABELS = {
    note: 'Note', appel: 'Appel', email: 'Email', reunion: 'Réunion', whatsapp: 'WhatsApp', tache: 'Tâche', autre: 'Autre'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cleanText(value, maxLength = 5000) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text.slice(0, maxLength) : null;
  }

  function cleanNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function stageRank(stage) {
    const index = CRM_STAGES.indexOf(stage);
    return index === -1 ? 0 : index;
  }

  function crmError(error, fallback = 'Opération CRM impossible dans Supabase.') {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === '42P01' || code === 'PGRST205' || /crm_(contacts|opportunities|activities).*?(does not exist|schema cache)|relation.*?does not exist/i.test(message)) {
      return new Error('Le module CRM Supabase n’est pas encore installé. Exécutez supabase/crm.sql dans le SQL Editor du projet, puis réessayez. Aucune donnée fictive n’est affichée.');
    }
    if (code === '42501' || /row-level security|permission denied/i.test(message)) {
      return new Error('Accès CRM refusé par Supabase. Vérifiez que votre profil est actif avec le rôle superadmin ou admin et que supabase/crm.sql a été appliqué.');
    }
    if (code === '23505' || /duplicate key|unique/i.test(message)) {
      return new Error('Un contact CRM avec cet email existe déjà. Modifiez la fiche existante.');
    }
    return new Error(message || fallback);
  }

  function ownerName(row) {
    return row?.owner?.full_name || row?.owner?.email || row?.owner_name || null;
  }

  function normalizeContact(row) {
    if (!row) return row;
    return { ...row, owner_name: ownerName(row) };
  }

  function normalizeOpportunity(row) {
    if (!row) return row;
    return {
      ...row,
      owner_name: ownerName(row),
      contact_name: row.contact?.full_name || row.contact_name || '',
      contact_organization: row.contact?.organization || row.contact_organization || '',
      contact_email: row.contact?.email || row.contact_email || ''
    };
  }

  function normalizeActivity(row) {
    if (!row) return row;
    return {
      ...row,
      contact_name: row.contact?.full_name || row.contact_name || '',
      opportunity_title: row.opportunity?.title || row.opportunity_title || '',
      creator_name: row.creator?.full_name || row.creator?.email || row.creator_name || null
    };
  }

  function contactPayload(input = {}) {
    return {
      full_name: cleanText(input.full_name, 200),
      organization: cleanText(input.organization, 250),
      email: cleanText(input.email, 254)?.toLowerCase() || null,
      phone: cleanText(input.phone, 80),
      type: CRM_CONTACT_TYPE_LABELS[input.type] ? input.type : 'prospect',
      status: CRM_CONTACT_STATUS_LABELS[input.status] ? input.status : 'nouveau',
      source: cleanText(input.source, 80) || 'manuel',
      source_ref_type: cleanText(input.source_ref_type, 80),
      source_ref_id: input.source_ref_id === undefined || input.source_ref_id === null || input.source_ref_id === '' ? null : Number(input.source_ref_id),
      country: cleanText(input.country, 100) || 'RDC',
      location: cleanText(input.location, 200),
      sector: cleanText(input.sector, 200),
      tags: cleanText(input.tags, 500),
      notes: cleanText(input.notes, 10000),
      owner_id: input.owner_id || null,
      last_contacted_at: input.last_contacted_at || null
    };
  }

  function opportunityPayload(input = {}) {
    return {
      contact_id: Number(input.contact_id),
      title: cleanText(input.title, 300),
      type: CRM_OPPORTUNITY_TYPE_LABELS[input.type] ? input.type : 'commerciale',
      stage: CRM_STAGES.includes(input.stage) ? input.stage : 'nouveau',
      amount: cleanNumber(input.amount),
      currency: ['USD', 'CDF', 'EUR'].includes(input.currency) ? input.currency : 'USD',
      probability: Math.max(0, Math.min(100, Math.round(Number(input.probability) || 0))),
      expected_close_date: input.expected_close_date || null,
      description: cleanText(input.description, 10000),
      source: cleanText(input.source, 80) || 'manuel',
      source_ref_type: cleanText(input.source_ref_type, 80),
      source_ref_id: input.source_ref_id === undefined || input.source_ref_id === null || input.source_ref_id === '' ? null : Number(input.source_ref_id),
      owner_id: input.owner_id || null
    };
  }

  function activityPayload(input = {}) {
    return {
      contact_id: Number(input.contact_id),
      opportunity_id: input.opportunity_id ? Number(input.opportunity_id) : null,
      type: CRM_ACTIVITY_TYPE_LABELS[input.type] ? input.type : 'tache',
      status: ['a_faire', 'terminee', 'annulee'].includes(input.status) ? input.status : 'a_faire',
      title: cleanText(input.title, 300),
      details: cleanText(input.details, 10000),
      due_at: input.due_at || null,
      completed_at: input.status === 'terminee' ? (input.completed_at || new Date().toISOString()) : null,
      created_by: input.created_by || null
    };
  }

  function createPortal(client) {
    async function profileFor(user) {
      if (!user) throw new Error('Votre session a expiré. Veuillez vous reconnecter.');
      const { data, error } = await client.from('profiles')
        .select('id,email,full_name,role,active').eq('id', user.id).maybeSingle();
      if (error) throw new Error('Impossible de vérifier le profil administrateur. Vérifiez les droits Supabase.');
      if (!data || data.active !== true || !['admin', 'superadmin'].includes(data.role)) {
        throw new Error('Ce compte ne possède pas de profil administrateur actif.');
      }
      return data;
    }

    async function signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) throw new Error('Connexion impossible. Vérifiez vos identifiants et la configuration Supabase.');
      try {
        return await profileFor(data.user);
      } catch (err) {
        await client.auth.signOut();
        throw err;
      }
    }

    async function restore() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      try {
        const result = await client.auth.getUser();
        if (result.error) throw result.error;
        return await profileFor(result.data.user);
      } catch (err) {
        await client.auth.signOut();
        throw err;
      }
    }

    async function dashboard() {
      const tables = ['candidatures', 'investors', 'inquiries', 'filiales'];
      const results = await Promise.all(tables.map(table =>
        client.from(table).select('*', { count: 'exact', head: true })
      ));
      if (results.some(result => result.error || typeof result.count !== 'number')) {
        throw new Error('Impossible de charger les données. Vérifiez les tables et les politiques RLS dans Supabase.');
      }
      return Object.fromEntries(tables.map((table, index) => [table, results[index].count]));
    }

    async function crmQuery(builder, fallback) {
      const result = await builder;
      if (result.error) throw crmError(result.error, fallback);
      return result.data;
    }

    async function listCrmOwners() {
      const data = await crmQuery(
        client.from('profiles')
          .select('id,email,full_name,role,active')
          .eq('active', true)
          .in('role', ['superadmin', 'admin'])
          .order('full_name', { ascending: true }),
        'Impossible de charger les responsables CRM.'
      );
      return Array.isArray(data) ? data : [];
    }

    async function listCrmContacts(filters = {}) {
      const search = cleanText(filters.search, 120)?.replace(/[%_,()]/g, ' ').trim();
      let query = client.from('crm_contacts')
        .select('*, owner:profiles!crm_contacts_owner_id_fkey(full_name,email)')
        .order('updated_at', { ascending: false });
      if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
      else if (filters.includeArchived !== true) query = query.neq('status', 'archive');
      if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type);
      if (search) {
        const term = `%${search}%`;
        query = query.or(`full_name.ilike.${term},email.ilike.${term},organization.ilike.${term},phone.ilike.${term},sector.ilike.${term}`);
      }
      const data = await crmQuery(query, 'Impossible de charger les contacts CRM.');
      return (Array.isArray(data) ? data : []).map(normalizeContact);
    }

    async function getCrmContact(id) {
      const contactId = Number(id);
      const [contact, opportunities, activities] = await Promise.all([
        crmQuery(
          client.from('crm_contacts')
            .select('*, owner:profiles!crm_contacts_owner_id_fkey(full_name,email)')
            .eq('id', contactId)
            .maybeSingle(),
          'Impossible de charger la fiche contact CRM.'
        ),
        crmQuery(
          client.from('crm_opportunities')
            .select('*, owner:profiles!crm_opportunities_owner_id_fkey(full_name,email), contact:crm_contacts!crm_opportunities_contact_id_fkey(full_name,organization,email)')
            .eq('contact_id', contactId)
            .order('updated_at', { ascending: false }),
          'Impossible de charger les opportunités du contact.'
        ),
        crmQuery(
          client.from('crm_activities')
            .select('*, contact:crm_contacts!crm_activities_contact_id_fkey(full_name), opportunity:crm_opportunities!crm_activities_opportunity_id_fkey(title), creator:profiles!crm_activities_created_by_fkey(full_name,email)')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false }),
          'Impossible de charger les activités du contact.'
        )
      ]);
      if (!contact) throw new Error('Contact CRM introuvable.');
      return {
        ...normalizeContact(contact),
        opportunities: (opportunities || []).map(normalizeOpportunity),
        activities: (activities || []).map(normalizeActivity)
      };
    }

    async function saveCrmContact(input, id = null) {
      const payload = contactPayload(input);
      if (!payload.full_name || !payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        throw new Error('Nom complet et email valide requis pour le contact CRM.');
      }
      const builder = id
        ? client.from('crm_contacts').update(payload).eq('id', Number(id)).select('*, owner:profiles!crm_contacts_owner_id_fkey(full_name,email)').single()
        : client.from('crm_contacts').insert(payload).select('*, owner:profiles!crm_contacts_owner_id_fkey(full_name,email)').single();
      return normalizeContact(await crmQuery(builder, 'Impossible d’enregistrer le contact CRM.'));
    }

    async function archiveCrmContact(id) {
      await crmQuery(
        client.from('crm_contacts').update({ status: 'archive' }).eq('id', Number(id)).select('id').single(),
        'Impossible d’archiver le contact CRM.'
      );
      return true;
    }

    async function listCrmOpportunities(filters = {}) {
      const search = cleanText(filters.search, 120)?.replace(/[%_,()]/g, ' ').trim();
      let query = client.from('crm_opportunities')
        .select('*, owner:profiles!crm_opportunities_owner_id_fkey(full_name,email), contact:crm_contacts!crm_opportunities_contact_id_fkey(full_name,organization,email)')
        .order('updated_at', { ascending: false });
      if (filters.stage && filters.stage !== 'all') query = query.eq('stage', filters.stage);
      if (filters.contactId) query = query.eq('contact_id', Number(filters.contactId));
      if (search) query = query.ilike('title', `%${search}%`);
      const data = await crmQuery(query, 'Impossible de charger les opportunités CRM.');
      return (Array.isArray(data) ? data : []).map(normalizeOpportunity);
    }

    async function saveCrmOpportunity(input, id = null) {
      const payload = opportunityPayload(input);
      if (!payload.contact_id || !payload.title) throw new Error('Contact et titre requis pour l’opportunité CRM.');
      const builder = id
        ? client.from('crm_opportunities').update(payload).eq('id', Number(id)).select().single()
        : client.from('crm_opportunities').insert(payload).select().single();
      return normalizeOpportunity(await crmQuery(builder, 'Impossible d’enregistrer l’opportunité CRM.'));
    }

    async function moveCrmOpportunity(id, stage) {
      if (!CRM_STAGES.includes(stage)) throw new Error('Étape CRM invalide.');
      const result = await crmQuery(
        client.from('crm_opportunities').update({ stage }).eq('id', Number(id)).select().single(),
        'Impossible de déplacer l’opportunité CRM.'
      );
      return normalizeOpportunity(result);
    }

    async function deleteCrmOpportunity(id) {
      await crmQuery(
        client.from('crm_opportunities').delete().eq('id', Number(id)).select('id').single(),
        'Impossible de supprimer l’opportunité CRM.'
      );
      return true;
    }

    async function listCrmActivities(filters = {}) {
      let query = client.from('crm_activities')
        .select('*, contact:crm_contacts!crm_activities_contact_id_fkey(full_name), opportunity:crm_opportunities!crm_activities_opportunity_id_fkey(title), creator:profiles!crm_activities_created_by_fkey(full_name,email)')
        .order('created_at', { ascending: false });
      if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters.contactId) query = query.eq('contact_id', Number(filters.contactId));
      const data = await crmQuery(query, 'Impossible de charger les activités CRM.');
      return (Array.isArray(data) ? data : []).map(normalizeActivity);
    }

    async function saveCrmActivity(input) {
      const payload = activityPayload(input);
      if (!payload.contact_id || !payload.title) throw new Error('Contact et titre requis pour l’activité CRM.');
      const data = await crmQuery(
        client.from('crm_activities').insert(payload).select().single(),
        'Impossible d’enregistrer l’activité CRM.'
      );
      if (payload.status === 'terminee') {
        await crmQuery(
          client.from('crm_contacts').update({ last_contacted_at: new Date().toISOString() }).eq('id', payload.contact_id).select('id').single(),
          'Activité enregistrée, mais date de dernier contact non mise à jour.'
        );
      }
      return normalizeActivity(data);
    }

    async function completeCrmActivity(id) {
      const data = await crmQuery(
        client.from('crm_activities')
          .update({ status: 'terminee', completed_at: new Date().toISOString() })
          .eq('id', Number(id))
          .select()
          .single(),
        'Impossible de terminer cette tâche CRM.'
      );
      if (data?.contact_id) {
        await crmQuery(
          client.from('crm_contacts').update({ last_contacted_at: new Date().toISOString() }).eq('id', data.contact_id).select('id').single(),
          'Tâche terminée, mais date de dernier contact non mise à jour.'
        );
      }
      return normalizeActivity(data);
    }

    async function deleteCrmActivity(id) {
      await crmQuery(
        client.from('crm_activities').delete().eq('id', Number(id)).select('id').single(),
        'Impossible de supprimer l’activité CRM.'
      );
      return true;
    }

    async function crmOverview() {
      const [contacts, opportunities, activities] = await Promise.all([
        crmQuery(client.from('crm_contacts').select('id,status,created_at').neq('status', 'archive'), 'Impossible de charger les indicateurs CRM.'),
        crmQuery(client.from('crm_opportunities').select('id,stage,amount,currency,probability'), 'Impossible de charger le pipeline CRM.'),
        crmQuery(client.from('crm_activities').select('id,status,due_at,created_at'), 'Impossible de charger les tâches CRM.')
      ]);
      const sourceTables = ['inquiries', 'investors', 'candidatures'];
      const sourceResults = await Promise.all(sourceTables.map(table =>
        client.from(table).select('*', { count: 'exact', head: true })
      ));
      const sources = Object.fromEntries(sourceTables.map((table, index) => [
        table,
        sourceResults[index]?.error ? null : sourceResults[index]?.count
      ]));
      const openOpportunities = (opportunities || []).filter(item => !['gagne', 'perdu'].includes(item.stage));
      const now = Date.now();
      return {
        contacts_total: (contacts || []).length,
        contacts_new_30d: (contacts || []).filter(item => now - new Date(item.created_at).getTime() <= 30 * 86400000).length,
        opportunities_open: openOpportunities.length,
        opportunities_won: (opportunities || []).filter(item => item.stage === 'gagne').length,
        opportunities_lost: (opportunities || []).filter(item => item.stage === 'perdu').length,
        pipeline_value: openOpportunities.reduce((sum, item) => sum + cleanNumber(item.amount), 0),
        pipeline_weighted_value: openOpportunities.reduce((sum, item) => sum + cleanNumber(item.amount) * (Number(item.probability) || 0) / 100, 0),
        tasks_open: (activities || []).filter(item => item.status === 'a_faire').length,
        tasks_overdue: (activities || []).filter(item => item.status === 'a_faire' && item.due_at && new Date(item.due_at).getTime() < now).length,
        sources
      };
    }

    async function syncCrmSources(profileId = null) {
      async function fetchAll(table, fallback) {
        const data = await crmQuery(client.from(table).select('*').order('id', { ascending: true }), fallback);
        return Array.isArray(data) ? data : [];
      }

      const [inquiries, investors, interests, candidatures, calls, existingContacts, existingOpportunities] = await Promise.all([
        fetchAll('inquiries', 'Impossible de lire les demandes commerciales à synchroniser.'),
        fetchAll('investors', 'Impossible de lire les investisseurs à synchroniser.'),
        fetchAll('investor_interests', 'Impossible de lire les intérêts investisseurs à synchroniser.'),
        fetchAll('candidatures', 'Impossible de lire les candidatures à synchroniser.'),
        fetchAll('call_for_projects', 'Impossible de lire les appels à projets à synchroniser.'),
        fetchAll('crm_contacts', 'Impossible de lire les contacts CRM existants.'),
        fetchAll('crm_opportunities', 'Impossible de lire les opportunités CRM existantes.')
      ]);

      const stats = {
        contacts_created: 0,
        contacts_updated: 0,
        opportunities_created: 0,
        opportunities_updated: 0,
        skipped: 0,
        sources: { inquiries: inquiries.length, investors: investors.length, investor_interests: interests.length, candidatures: candidatures.length }
      };
      const contactsBySource = new Map();
      const contactsByEmail = new Map();
      existingContacts.forEach(contact => {
        if (contact.source_ref_type && contact.source_ref_id) contactsBySource.set(`${contact.source_ref_type}:${contact.source_ref_id}`, contact);
        if (contact.email) contactsByEmail.set(String(contact.email).toLowerCase(), contact);
      });
      const opportunitiesBySource = new Map();
      existingOpportunities.forEach(item => {
        if (item.source_ref_type && item.source_ref_id) opportunitiesBySource.set(`${item.source_ref_type}:${item.source_ref_id}`, item);
      });

      async function upsertContact(input) {
        const payload = contactPayload(input);
        if (!payload.full_name || !payload.email) { stats.skipped += 1; return null; }
        const sourceKey = payload.source_ref_type && payload.source_ref_id ? `${payload.source_ref_type}:${payload.source_ref_id}` : null;
        const existing = (sourceKey && contactsBySource.get(sourceKey)) || contactsByEmail.get(payload.email);
        if (existing) {
          payload.status = existing.status === 'archive' ? 'archive' : payload.status;
          payload.owner_id = existing.owner_id || payload.owner_id || profileId;
          payload.notes = existing.notes || payload.notes;
          payload.tags = existing.tags || payload.tags;
          if (!payload.source_ref_type && existing.source_ref_type) {
            payload.source_ref_type = existing.source_ref_type;
            payload.source_ref_id = existing.source_ref_id;
          }
          const updated = await saveCrmContact(payload, existing.id);
          stats.contacts_updated += 1;
          contactsByEmail.set(payload.email, updated);
          if (sourceKey) contactsBySource.set(sourceKey, updated);
          return updated;
        }
        payload.owner_id = payload.owner_id || profileId;
        const created = await saveCrmContact(payload);
        stats.contacts_created += 1;
        contactsByEmail.set(payload.email, created);
        if (sourceKey) contactsBySource.set(sourceKey, created);
        return created;
      }

      async function upsertOpportunity(input) {
        const payload = opportunityPayload(input);
        if (!payload.contact_id || !payload.title) { stats.skipped += 1; return null; }
        const sourceKey = payload.source_ref_type && payload.source_ref_id ? `${payload.source_ref_type}:${payload.source_ref_id}` : null;
        const existing = sourceKey ? opportunitiesBySource.get(sourceKey) : null;
        if (existing) {
          if (!['gagne', 'perdu'].includes(payload.stage) && stageRank(existing.stage) > stageRank(payload.stage)) {
            payload.stage = existing.stage;
            payload.probability = existing.probability;
          }
          payload.owner_id = existing.owner_id || payload.owner_id || profileId;
          const updated = await saveCrmOpportunity(payload, existing.id);
          stats.opportunities_updated += 1;
          opportunitiesBySource.set(sourceKey, updated);
          return updated;
        }
        payload.owner_id = payload.owner_id || profileId;
        const created = await saveCrmOpportunity(payload);
        stats.opportunities_created += 1;
        if (sourceKey) opportunitiesBySource.set(sourceKey, created);
        return created;
      }

      const inquiryStage = { nouveau: 'nouveau', en_cours: 'qualification', en_attente: 'contacte', resolu: 'gagne' };
      for (const row of inquiries) {
        const contact = await upsertContact({
          full_name: row.name, organization: row.organization, email: row.email, phone: row.phone,
          type: 'prospect', status: row.status === 'resolu' ? 'actif' : 'nouveau', source: 'Demande commerciale site',
          source_ref_type: 'inquiry', source_ref_id: row.id, sector: row.service_requested,
          notes: row.message, owner_id: row.assigned_to || profileId, last_contacted_at: row.responded_at || null
        });
        if (contact) await upsertOpportunity({
          contact_id: contact.id, title: row.subject || `Demande ${row.reference || row.id}`, type: 'commerciale',
          stage: inquiryStage[row.status] || 'nouveau', probability: row.status === 'resolu' ? 100 : 25,
          description: row.message, source: 'Demande commerciale site', source_ref_type: 'inquiry', source_ref_id: row.id,
          owner_id: row.assigned_to || profileId
        });
      }

      const investorById = new Map();
      for (const row of investors) {
        const contact = await upsertContact({
          full_name: row.name, organization: row.organization, email: row.email, phone: row.phone,
          type: 'investisseur', status: row.status === 'desactive' ? 'inactif' : row.status === 'valide' ? 'actif' : 'nouveau',
          source: 'Espace investisseurs', source_ref_type: 'investor', source_ref_id: row.id,
          country: row.country || 'RDC', sector: row.sectors_of_interest, notes: row.notes,
          tags: row.investor_type, owner_id: profileId
        });
        if (contact) investorById.set(row.id, contact);
      }

      function investorStage(value = '') {
        const text = String(value).toLowerCase();
        if (/gagn|sign|clôtur|clotur|final/.test(text)) return 'gagne';
        if (/perd|refus|abandon/.test(text)) return 'perdu';
        if (/term sheet|proposition/.test(text)) return 'proposition';
        if (/négociation|negociation/.test(text)) return 'negociation';
        if (/due diligence|réunion|reunion|meeting/.test(text)) return 'reunion';
        if (/qualification|analyse|évaluation|evaluation/.test(text)) return 'qualification';
        return 'contacte';
      }
      for (const row of interests) {
        const contact = investorById.get(row.investor_id);
        if (!contact) { stats.skipped += 1; continue; }
        await upsertOpportunity({
          contact_id: contact.id, title: row.project_title || 'Intérêt investisseur', type: 'investissement',
          stage: investorStage(row.stage), amount: row.amount_intended, probability: 35,
          description: row.notes, source: 'Pipeline investisseurs', source_ref_type: 'investor_interest',
          source_ref_id: row.id, owner_id: profileId
        });
      }

      const callById = new Map(calls.map(call => [call.id, call]));
      const candidatureStage = { recu: 'nouveau', en_evaluation: 'qualification', retenu: 'gagne', rejete: 'perdu' };
      for (const row of candidatures) {
        const contact = await upsertContact({
          full_name: row.candidate_name, email: row.candidate_email, phone: row.candidate_phone,
          type: 'porteur_projet', status: row.status === 'retenu' ? 'actif' : 'nouveau',
          source: 'Candidature appel à projets', source_ref_type: 'candidature', source_ref_id: row.id,
          location: row.location, sector: row.sector, notes: row.summary,
          owner_id: row.evaluator_id || profileId
        });
        if (contact) await upsertOpportunity({
          contact_id: contact.id,
          title: row.project_title || (row.call_id ? `Candidature — ${callById.get(row.call_id)?.title || 'Appel à projets'}` : 'Candidature spontanée'),
          type: 'appel_projet', stage: candidatureStage[row.status] || 'nouveau',
          amount: row.funding_requested, currency: row.currency || 'USD',
          probability: row.status === 'retenu' ? 100 : row.status === 'rejete' ? 0 : 30,
          description: [row.summary, row.details].filter(Boolean).join('\n\n'),
          source: 'Candidature appel à projets', source_ref_type: 'candidature', source_ref_id: row.id,
          owner_id: row.evaluator_id || profileId
        });
      }

      return stats;
    }

    async function signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw new Error('La déconnexion a échoué. Réessayez.');
    }

    return {
      signIn,
      restore,
      dashboard,
      signOut,
      crmOverview,
      syncCrmSources,
      listCrmOwners,
      listCrmContacts,
      getCrmContact,
      saveCrmContact,
      archiveCrmContact,
      listCrmOpportunities,
      saveCrmOpportunity,
      moveCrmOpportunity,
      deleteCrmOpportunity,
      listCrmActivities,
      saveCrmActivity,
      completeCrmActivity,
      deleteCrmActivity
    };
  }

  async function start(document, supabaseLibrary) {
    const errorBox = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');
    function showError(message) {
      errorText.textContent = message;
      errorBox.classList.remove('hidden');
    }
    if (!supabaseLibrary || !supabaseLibrary.createClient) {
      showError('Le client Supabase est indisponible. Vérifiez que les fichiers du site ont été déployés.');
      return;
    }

    let client;
    try {
      client = supabaseLibrary.createClient(
        'https://vumerporrumovowyonfj.supabase.co',
        'sb_publishable_1clRgc8vKrinbm0VM7OR2g_BUnDZVV4'
      );
    } catch (err) {
      showError('Impossible de démarrer le client Supabase. Vérifiez sa configuration.');
      return;
    }
    const portal = createPortal(client);
    root.supabaseAdminPortal = portal;
    const form = document.getElementById('login-form');
    const button = document.getElementById('login-submit-btn');
    const loginScreen = document.getElementById('login-screen');
    const app = document.getElementById('app-wrapper');
    const view = document.getElementById('view-container');

    let currentProfile = null;
    let crmTab = 'contacts';
    let crmFilters = { search: '', type: 'all', status: 'all', stage: 'all' };
    let crmOwners = [];
    let crmContacts = [];
    let crmOpportunities = [];
    let crmActivities = [];
    let crmOverviewData = null;
    let navBound = false;
    let crmEventsBound = false;
    let modalEventsBound = false;
    let modalConfirmHandler = null;

    function optionalEl(id) {
      try { return document.getElementById(id) || null; } catch (e) { return null; }
    }

    function setHidden(element, hidden) {
      if (!element || !element.classList) return;
      if (hidden) element.classList.add('hidden');
      else element.classList.remove('hidden');
    }

    function showCrmToast(message, type = 'success') {
      const container = optionalEl('toast-container');
      if (!container || !document.createElement) return;
      const toast = document.createElement('div');
      toast.className = `px-5 py-4 rounded-2xl shadow-2xl text-xs font-bold text-white flex items-center gap-3 pointer-events-auto ${type === 'error' ? 'bg-red-600' : 'bg-emerald-900 border-l-4 border-yellow-400'}`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4200);
    }

    function formatMoney(amount, currency = 'USD') {
      const value = cleanNumber(amount);
      try {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(value);
      } catch (e) {
        return `${value.toLocaleString('fr-FR')} ${currency || 'USD'}`;
      }
    }

    function formatDate(value, withTime = false) {
      if (!value) return '—';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return escapeHtml(value);
      return date.toLocaleString('fr-FR', withTime
        ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function isOverdue(activity) {
      return activity?.status === 'a_faire' && activity?.due_at && new Date(activity.due_at).getTime() < Date.now();
    }

    function optionsHtml(labels, selected) {
      return Object.entries(labels).map(([value, label]) => `<option value="${value}" ${String(selected) === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
    }

    function ownersOptions(selected) {
      return '<option value="">Non assigné</option>' + crmOwners.map(owner => `
        <option value="${escapeHtml(owner.id)}" ${String(owner.id) === String(selected) ? 'selected' : ''}>${escapeHtml(owner.full_name || owner.email)} (${escapeHtml(owner.role)})</option>
      `).join('');
    }

    function contactsOptions(selected) {
      return crmContacts.filter(contact => contact.status !== 'archive').map(contact => `
        <option value="${Number(contact.id)}" ${String(contact.id) === String(selected) ? 'selected' : ''}>${escapeHtml(contact.full_name)}${contact.organization ? ` — ${escapeHtml(contact.organization)}` : ''}</option>
      `).join('');
    }

    function updateCrmBadge(overview) {
      const badge = optionalEl('badge-crm-count');
      if (!badge) return;
      const count = Number(overview?.tasks_overdue || 0);
      badge.textContent = count;
      setHidden(badge, count === 0);
      badge.title = `${count} tâche(s) CRM en retard`;
    }

    function configureNav(activeRoute) {
      const links = document.querySelectorAll('.nav-item');
      links.forEach(link => {
        const route = link.getAttribute('data-route');
        const visible = route === 'dashboard' || route === 'crm';
        setHidden(link, !visible);
        if (route === activeRoute) link.classList.add('active');
        else link.classList.remove('active');
        if (!navBound && visible && link.addEventListener) {
          link.addEventListener('click', async event => {
            event.preventDefault();
            if (!currentProfile) return;
            if (route === 'crm') await showCRM(currentProfile);
            else await showDashboard(currentProfile);
          });
        }
      });
      navBound = true;
      document.querySelectorAll('#sidebar nav > div').forEach(heading => {
        const isCrmHeading = String(heading.textContent || '').toLowerCase().includes('relation client');
        setHidden(heading, !isCrmHeading);
      });
    }

    function setShell(profile, title, subtitle, route) {
      currentProfile = profile;
      setHidden(loginScreen, true);
      setHidden(app, false);
      const name = optionalEl('user-display-name');
      if (name) name.textContent = profile.full_name || profile.email;
      const role = optionalEl('user-role-badge');
      if (role) role.textContent = profile.role === 'superadmin' ? 'Super Administrateur' : 'Administrateur';
      const avatar = optionalEl('user-avatar');
      if (avatar) avatar.textContent = (profile.full_name || profile.email || 'A').slice(0, 2).toUpperCase();
      const pageTitle = optionalEl('page-title');
      if (pageTitle) pageTitle.textContent = title;
      const pageSubtitle = optionalEl('page-subtitle');
      if (pageSubtitle) pageSubtitle.textContent = subtitle;
      setHidden(optionalEl('admin-notifications'), true);
      setHidden(optionalEl('admin-change-password'), true);
      configureNav(route);
      bindCrmEvents();
    }

    function bindModalEvents() {
      if (modalEventsBound) return;
      const container = optionalEl('modal-container');
      const content = optionalEl('modal-content');
      if (!container || !content || !content.addEventListener) return;
      modalEventsBound = true;
      container.addEventListener('click', event => {
        if (event.target === container) closeCrmModal();
      });
      content.addEventListener('click', async event => {
        const closeButton = event.target?.closest?.('[data-crm-modal-close]');
        if (closeButton) { closeCrmModal(); return; }
        const actionButton = event.target?.closest?.('[data-crm-action]');
        if (actionButton) { await handleCrmAction(actionButton); return; }
        const confirmButton = event.target?.closest?.('#sb-crm-modal-confirm');
        if (!confirmButton || !modalConfirmHandler) return;
        confirmButton.disabled = true;
        const previous = confirmButton.innerHTML;
        confirmButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Traitement...';
        try {
          await modalConfirmHandler();
          closeCrmModal();
        } catch (err) {
          const error = optionalEl('sb-crm-modal-error');
          if (error) { error.textContent = err.message; setHidden(error, false); }
          showCrmToast(err.message, 'error');
        } finally {
          confirmButton.disabled = false;
          confirmButton.innerHTML = previous;
        }
      });
      content.addEventListener('change', async event => {
        if (event.target?.id === 'sb-crm-activity-contact') {
          await populateActivityOpportunities(event.target.value, null);
        }
      });
    }

    function openCrmModal(title, bodyHtml, onConfirm = null) {
      const container = optionalEl('modal-container');
      const content = optionalEl('modal-content');
      if (!container || !content) { showCrmToast('Fenêtre CRM indisponible.', 'error'); return; }
      bindModalEvents();
      modalConfirmHandler = onConfirm;
      content.innerHTML = `
        <div class="px-6 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 class="text-sm font-bold text-slate-800">${escapeHtml(title)}</h3>
          <button type="button" data-crm-modal-close class="w-8 h-8 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-500 shadow-xs border border-slate-200"><i class="fas fa-xmark text-xs"></i></button>
        </div>
        <div class="p-6 overflow-y-auto flex-1">
          <div id="sb-crm-modal-error" class="hidden mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold"></div>
          ${bodyHtml}
        </div>
        ${onConfirm ? `<div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
          <button type="button" data-crm-modal-close class="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl">Annuler</button>
          <button type="button" id="sb-crm-modal-confirm" class="px-6 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 text-xs font-bold rounded-xl shadow">Enregistrer</button>
        </div>` : ''}
      `;
      setHidden(container, false);
    }

    function closeCrmModal() {
      modalConfirmHandler = null;
      setHidden(optionalEl('modal-container'), true);
    }

    function bindCrmEvents() {
      bindModalEvents();
      if (crmEventsBound || !view || !view.addEventListener) return;
      crmEventsBound = true;
      view.addEventListener('click', async event => {
        const tabButton = event.target?.closest?.('[data-crm-tab]');
        if (tabButton) {
          crmTab = tabButton.getAttribute('data-crm-tab') || 'contacts';
          document.querySelectorAll('[data-crm-tab]').forEach(button => {
            const active = button.getAttribute('data-crm-tab') === crmTab;
            button.className = `px-4 py-2.5 text-xs font-bold rounded-2xl flex items-center gap-2 ${active ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;
          });
          await renderCrmTab();
          return;
        }
        const actionButton = event.target?.closest?.('[data-crm-action]');
        if (actionButton) await handleCrmAction(actionButton);
      });
      view.addEventListener('change', async event => {
        const target = event.target;
        if (!target) return;
        if (target.id === 'sb-crm-type' || target.id === 'sb-crm-status') {
          applyContactFilters();
          return;
        }
        if (target.id === 'sb-crm-stage-filter') {
          crmFilters.stage = target.value;
          await renderCrmTab();
          return;
        }
        if (target.hasAttribute && target.hasAttribute('data-crm-stage-select')) {
          const id = target.getAttribute('data-crm-stage-select');
          try {
            await portal.moveCrmOpportunity(id, target.value);
            showCrmToast(`Opportunité déplacée vers « ${CRM_STAGE_LABELS[target.value]} ».`);
            await renderCrmTab();
          } catch (err) {
            showCrmToast(err.message, 'error');
            await renderCrmTab();
          }
        }
      });
      view.addEventListener('keydown', event => {
        if (event.target?.id === 'sb-crm-search' && event.key === 'Enter') {
          event.preventDefault();
          applyContactFilters();
        }
      });
    }

    function confirmAction(message) {
      if (root && typeof root.confirm === 'function') return root.confirm(message);
      return true;
    }

    async function handleCrmAction(button) {
      const action = button.getAttribute('data-crm-action');
      const id = button.getAttribute('data-id');
      const contactId = button.getAttribute('data-contact-id');
      const opportunityId = button.getAttribute('data-opportunity-id');
      try {
        if (action === 'open-crm' || action === 'retry-crm') await showCRM(currentProfile);
        else if (action === 'back-dashboard') await showDashboard(currentProfile);
        else if (action === 'sync-sources') {
          button.disabled = true;
          const result = await portal.syncCrmSources(currentProfile?.id);
          showCrmToast(`Synchronisation Supabase terminée : ${result.contacts_created} contact(s) créé(s), ${result.opportunities_created} opportunité(s) créée(s).`);
          await showCRM(currentProfile);
        }
        else if (action === 'export-csv') await exportCrmCsv();
        else if (action === 'new-contact') await openContactModal();
        else if (action === 'edit-contact') await openContactModal(id);
        else if (action === 'view-contact') await openContactDetail(id);
        else if (action === 'archive-contact') {
          if (!confirmAction('Archiver ce contact CRM ? Son historique sera conservé.')) return;
          await portal.archiveCrmContact(id);
          closeCrmModal();
          showCrmToast('Contact CRM archivé.');
          await showCRM(currentProfile);
        }
        else if (action === 'new-opportunity') await openOpportunityModal(null, contactId);
        else if (action === 'edit-opportunity') await openOpportunityModal(id, contactId);
        else if (action === 'delete-opportunity') {
          if (!confirmAction('Supprimer définitivement cette opportunité CRM ?')) return;
          await portal.deleteCrmOpportunity(id);
          showCrmToast('Opportunité CRM supprimée.');
          await renderCrmTab();
        }
        else if (action === 'new-activity') await openActivityModal(contactId, opportunityId);
        else if (action === 'complete-activity') {
          await portal.completeCrmActivity(id);
          showCrmToast('Tâche CRM marquée terminée.');
          if (contactId) await openContactDetail(contactId);
          else await showCRM(currentProfile);
        }
        else if (action === 'delete-activity') {
          if (!confirmAction('Supprimer cette activité CRM ?')) return;
          await portal.deleteCrmActivity(id);
          showCrmToast('Activité CRM supprimée.');
          await renderCrmTab();
        }
        else if (action === 'apply-contact-filters') applyContactFilters();
      } catch (err) {
        showCrmToast(err.message, 'error');
      } finally {
        button.disabled = false;
      }
    }

    async function exportCrmCsv() {
      const [contacts, opportunities] = await Promise.all([
        portal.listCrmContacts({ includeArchived: true }),
        portal.listCrmOpportunities()
      ]);
      const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const lines = [
        'CONTACTS CRM',
        ['ID', 'Nom', 'Organisation', 'Email', 'Téléphone', 'Type', 'Statut', 'Source', 'Responsable'].join(';'),
        ...contacts.map(item => [item.id, item.full_name, item.organization, item.email, item.phone, item.type, item.status, item.source, item.owner_name].map(cell).join(';')),
        '',
        'OPPORTUNITÉS CRM',
        ['ID', 'Titre', 'Contact', 'Étape', 'Montant', 'Devise', 'Probabilité', 'Responsable'].join(';'),
        ...opportunities.map(item => [item.id, item.title, item.contact_name, item.stage, item.amount, item.currency, item.probability, item.owner_name].map(cell).join(';'))
      ];
      if (!root || !root.Blob || !root.URL || !document.createElement) throw new Error('Export CSV indisponible dans ce navigateur.');
      const blob = new root.Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = root.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'CRM_PKGlobal_Supabase.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => root.URL.revokeObjectURL(url), 1000);
      showCrmToast('Export CRM CSV téléchargé.');
    }

    async function showDashboard(profile) {
      if (root && root.location && root.location.hash === '#/crm') {
        await showCRM(profile);
        return;
      }
      setShell(profile, 'Tableau de bord', 'Données Supabase réelles — dashboard et CRM', 'dashboard');
      view.textContent = 'Chargement des données Supabase…';
      try {
        const counts = await portal.dashboard();
        // Only fixed labels and numeric counts are inserted as HTML here.
        view.innerHTML = `<div class="space-y-6">
          <div class="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <span class="px-3 py-1 bg-yellow-400 text-emerald-950 text-[10px] font-black uppercase tracking-widest rounded-full">Supabase</span>
                <h1 class="text-2xl font-black mt-3">Bienvenue dans l’espace administrateur</h1>
                <p class="text-emerald-100/85 text-sm mt-2 max-w-2xl">Les indicateurs ci-dessous et le module CRM utilisent uniquement les données réelles de votre projet Supabase. Les modules historiques Node/SQLite restent disponibles uniquement en mode Node.</p>
              </div>
              <button type="button" data-crm-action="open-crm" class="px-5 py-3 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 text-sm font-black rounded-2xl shadow shrink-0"><i class="fas fa-address-book mr-2"></i>Ouvrir le CRM</button>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">${[['Candidatures', counts.candidatures], ['Investisseurs', counts.investors], ['Demandes', counts.inquiries], ['Filiales', counts.filiales]].map(([label, count]) => `<div class="bg-white p-5 rounded-2xl border border-slate-200"><div class="text-sm text-slate-500">${label}</div><div class="text-2xl font-bold mt-2">${count}</div></div>`).join('')}</div>
        </div>`;
      } catch (err) {
        view.textContent = err.message;
      }
    }

    async function showCRM(profile) {
      if (!profile) return;
      setShell(profile, 'CRM — Contacts & Pipeline', 'CRM Supabase : contacts réels, opportunités et relances', 'crm');
      view.textContent = 'Chargement du CRM Supabase…';
      try {
        const [overview, owners] = await Promise.all([
          portal.crmOverview(),
          portal.listCrmOwners()
        ]);
        crmOverviewData = overview;
        crmOwners = owners;
        updateCrmBadge(overview);
        view.innerHTML = `
          <div class="space-y-6">
            <div class="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl overflow-hidden">
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div class="max-w-3xl">
                  <span class="px-3 py-1 bg-yellow-400 text-emerald-950 text-[10px] font-black uppercase tracking-widest rounded-full">Relation client · Supabase</span>
                  <h3 class="text-2xl font-black mt-3">CRM PK Global Partners</h3>
                  <p class="text-emerald-100/85 text-xs leading-relaxed mt-2">Synchronisez les demandes, investisseurs et candidatures déjà présents dans Supabase, ou créez vos contacts manuellement. Aucune donnée de démonstration n’est ajoutée.</p>
                </div>
                <div class="flex flex-wrap items-center gap-2 shrink-0">
                  <button type="button" data-crm-action="sync-sources" class="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-2 border border-white/15"><i class="fas fa-rotate"></i> Synchroniser les sources</button>
                  <button type="button" data-crm-action="export-csv" class="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-2 border border-white/15"><i class="fas fa-file-csv"></i> Export CSV</button>
                  <button type="button" data-crm-action="new-contact" class="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 text-xs font-bold rounded-xl shadow flex items-center gap-2"><i class="fas fa-user-plus"></i> Nouveau contact</button>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs"><div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Contacts actifs</div><div class="text-3xl font-black mt-2">${Number(overview.contacts_total || 0)}</div><div class="text-[11px] text-slate-500 mt-1">${Number(overview.contacts_new_30d || 0)} sur 30 jours</div></div>
              <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs"><div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Opportunités ouvertes</div><div class="text-3xl font-black mt-2">${Number(overview.opportunities_open || 0)}</div><div class="text-[11px] text-slate-500 mt-1">${Number(overview.opportunities_won || 0)} gagnée(s) · ${Number(overview.opportunities_lost || 0)} perdue(s)</div></div>
              <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs"><div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Valeur du pipeline</div><div class="text-2xl font-black mt-2">${formatMoney(overview.pipeline_value)}</div><div class="text-[11px] text-slate-500 mt-1">Pondéré : ${formatMoney(overview.pipeline_weighted_value)}</div></div>
              <div class="bg-white p-5 rounded-3xl border ${Number(overview.tasks_overdue || 0) ? 'border-red-200 bg-red-50/60' : 'border-slate-200'} shadow-xs"><div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Tâches à suivre</div><div class="text-3xl font-black mt-2">${Number(overview.tasks_open || 0)}</div><div class="text-[11px] ${Number(overview.tasks_overdue || 0) ? 'text-red-700 font-bold' : 'text-slate-500'} mt-1">${Number(overview.tasks_overdue || 0)} en retard</div></div>
            </div>

            <div class="bg-white p-3 rounded-3xl border border-slate-200 shadow-xs overflow-x-auto">
              <div class="flex flex-col md:flex-row md:items-center gap-3 min-w-[520px]">
                <div class="flex items-center gap-2">
                  ${[['contacts', 'fa-users', 'Contacts'], ['pipeline', 'fa-table-columns', 'Pipeline'], ['activities', 'fa-list-check', 'Activités & tâches']].map(([tab, icon, label]) => `<button type="button" data-crm-tab="${tab}" class="px-4 py-2.5 text-xs font-bold rounded-2xl flex items-center gap-2 ${crmTab === tab ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"><i class="fas ${icon}"></i> ${label}</button>`).join('')}
                </div>
                <span class="text-[10px] font-semibold text-slate-400 whitespace-nowrap md:ml-auto">Sources Supabase : ${overview.sources?.inquiries ?? '—'} demandes · ${overview.sources?.investors ?? '—'} investisseurs · ${overview.sources?.candidatures ?? '—'} candidatures</span>
              </div>
            </div>
            <div id="sb-crm-tab-content"></div>
          </div>`;
        await renderCrmTab();
      } catch (err) {
        view.innerHTML = `
          <div class="max-w-3xl mx-auto bg-amber-50 border border-amber-200 rounded-3xl p-6 md:p-8 text-amber-950">
            <div class="w-12 h-12 rounded-2xl bg-amber-400 text-emerald-950 flex items-center justify-center mb-4"><i class="fas fa-database"></i></div>
            <h3 class="text-lg font-black">CRM Supabase non disponible</h3>
            <p class="text-sm leading-relaxed mt-2">${escapeHtml(err.message)}</p>
            <ol class="list-decimal ml-5 mt-4 text-xs leading-relaxed space-y-1">
              <li>Sauvegardez la base et revoyez les politiques RLS existantes.</li>
              <li>Ouvrez Supabase → SQL Editor.</li>
              <li>Exécutez le fichier <code class="font-black">supabase/crm.sql</code> du dépôt.</li>
              <li>Revenez ici et cliquez sur Réessayer.</li>
            </ol>
            <div class="flex flex-wrap gap-2 mt-6">
              <button type="button" data-crm-action="retry-crm" class="px-5 py-3 bg-emerald-900 text-yellow-400 text-xs font-black rounded-xl">Réessayer</button>
              <button type="button" data-crm-action="back-dashboard" class="px-5 py-3 bg-white border border-amber-300 text-xs font-black rounded-xl">Retour au dashboard</button>
            </div>
          </div>`;
      }
    }

    async function renderCrmTab() {
      const target = optionalEl('sb-crm-tab-content');
      if (!target) return;
      target.innerHTML = '<div class="h-40 flex items-center justify-center text-slate-400 text-xs"><i class="fas fa-circle-notch fa-spin text-2xl text-emerald-600 mr-3"></i> Chargement du CRM...</div>';
      try {
        if (crmTab === 'pipeline') await renderCrmPipeline(target);
        else if (crmTab === 'activities') await renderCrmActivities(target);
        else await renderCrmContacts(target);
      } catch (err) {
        target.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-800 p-5 rounded-3xl text-xs">${escapeHtml(err.message)}</div>`;
      }
    }

    function applyContactFilters() {
      crmFilters.search = optionalEl('sb-crm-search')?.value || '';
      crmFilters.type = optionalEl('sb-crm-type')?.value || 'all';
      crmFilters.status = optionalEl('sb-crm-status')?.value || 'all';
      renderCrmTab();
    }

    async function renderCrmContacts(target) {
      const [contacts, opportunities, activities] = await Promise.all([
        portal.listCrmContacts({ search: crmFilters.search, type: crmFilters.type, status: crmFilters.status, includeArchived: crmFilters.status === 'archive' }),
        portal.listCrmOpportunities(),
        portal.listCrmActivities()
      ]);
      crmContacts = contacts;
      crmOpportunities = opportunities;
      crmActivities = activities;
      const openOpps = new Map();
      opportunities.filter(item => !['gagne', 'perdu'].includes(item.stage)).forEach(item => openOpps.set(item.contact_id, (openOpps.get(item.contact_id) || 0) + 1));
      const openTasks = new Map();
      activities.filter(item => item.status === 'a_faire').forEach(item => openTasks.set(item.contact_id, (openTasks.get(item.contact_id) || 0) + 1));
      target.innerHTML = `
        <div class="space-y-4">
          <div class="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
            <div class="grid grid-cols-1 md:grid-cols-[1fr_190px_190px_auto] gap-3">
              <input id="sb-crm-search" type="search" value="${escapeHtml(crmFilters.search)}" placeholder="Rechercher un nom, email, organisation, secteur..." class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs">
              <select id="sb-crm-type" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"><option value="all">Tous les types</option>${optionsHtml(CRM_CONTACT_TYPE_LABELS, crmFilters.type)}</select>
              <select id="sb-crm-status" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"><option value="all">Tous les statuts visibles</option>${optionsHtml(CRM_CONTACT_STATUS_LABELS, crmFilters.status)}</select>
              <button type="button" data-crm-action="apply-contact-filters" class="px-4 py-2.5 bg-emerald-900 text-yellow-400 text-xs font-bold rounded-xl">Filtrer</button>
            </div>
          </div>
          <div class="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[860px] text-left text-xs">
                <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold"><tr><th class="py-3.5 px-4">Contact</th><th class="py-3.5 px-4">Coordonnées</th><th class="py-3.5 px-4">Type / Statut</th><th class="py-3.5 px-4">Responsable</th><th class="py-3.5 px-4">Suivi</th><th class="py-3.5 px-4 text-right">Actions</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                  ${contacts.length === 0 ? '<tr><td colspan="6" class="py-14 text-center text-slate-400">Aucun contact réel trouvé. Synchronisez les sources Supabase ou créez un contact.</td></tr>' : contacts.map(contact => `
                    <tr class="hover:bg-slate-50/70">
                      <td class="py-3.5 px-4"><div class="font-bold text-slate-800">${escapeHtml(contact.full_name)}</div><div class="text-[10px] text-slate-500">${escapeHtml(contact.organization || 'Organisation non renseignée')}</div><div class="text-[10px] text-slate-400 mt-1">Source : ${escapeHtml(contact.source || 'manuel')}${contact.sector ? ` · ${escapeHtml(contact.sector)}` : ''}</div></td>
                      <td class="py-3.5 px-4"><div class="break-all text-slate-700">${escapeHtml(contact.email)}</div><div class="text-[10px] text-slate-500 mt-1">${escapeHtml(contact.phone || 'Téléphone non renseigné')}</div><div class="text-[10px] text-slate-400">${escapeHtml([contact.location, contact.country].filter(Boolean).join(', '))}</div></td>
                      <td class="py-3.5 px-4"><span class="badge-status badge-crm-${contact.status === 'archive' ? 'archive' : contact.status === 'actif' ? 'actif' : contact.status === 'inactif' ? 'inactif' : 'nouveau'}">${escapeHtml(CRM_CONTACT_STATUS_LABELS[contact.status] || contact.status)}</span><div class="text-[10px] text-slate-500 mt-1.5">${escapeHtml(CRM_CONTACT_TYPE_LABELS[contact.type] || contact.type)}</div></td>
                      <td class="py-3.5 px-4 font-semibold text-slate-700">${escapeHtml(contact.owner_name || 'Non assigné')}</td>
                      <td class="py-3.5 px-4"><div><strong>${openOpps.get(contact.id) || 0}</strong> opportunité(s) ouverte(s)</div><div class="text-[10px] text-slate-400 mt-1">${openTasks.get(contact.id) || 0} tâche(s) à faire · Dernier contact : ${formatDate(contact.last_contacted_at)}</div></td>
                      <td class="py-3.5 px-4"><div class="flex justify-end flex-wrap gap-1.5">
                        <button type="button" data-crm-action="view-contact" data-id="${Number(contact.id)}" class="px-3 py-1.5 bg-yellow-400 text-emerald-950 rounded-xl font-bold">Voir</button>
                        <button type="button" data-crm-action="edit-contact" data-id="${Number(contact.id)}" class="px-3 py-1.5 bg-slate-100 rounded-xl font-bold">Modifier</button>
                        <button type="button" data-crm-action="new-opportunity" data-contact-id="${Number(contact.id)}" class="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-xl font-bold">+ Opportunité</button>
                        <button type="button" data-crm-action="new-activity" data-contact-id="${Number(contact.id)}" class="px-3 py-1.5 bg-blue-50 text-blue-800 rounded-xl font-bold">+ Activité</button>
                      </div></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    }

    async function renderCrmPipeline(target) {
      const opportunities = await portal.listCrmOpportunities({ stage: crmFilters.stage });
      crmOpportunities = opportunities;
      const groups = CRM_STAGES.map(stage => {
        const rows = opportunities.filter(item => item.stage === stage);
        return { stage, rows, amount: rows.reduce((sum, item) => sum + cleanNumber(item.amount), 0) };
      });
      target.innerHTML = `
        <div class="space-y-4">
          <div class="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div><h4 class="text-sm font-bold text-slate-800">Pipeline des opportunités</h4><p class="text-[11px] text-slate-500">Défilement horizontal sur mobile. Changez l’étape sur chaque carte.</p></div>
            <div class="flex flex-col sm:flex-row gap-2">
              <select id="sb-crm-stage-filter" class="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"><option value="all">Toutes les étapes</option>${optionsHtml(CRM_STAGE_LABELS, crmFilters.stage)}</select>
              <button type="button" data-crm-action="new-opportunity" class="px-4 py-2.5 bg-emerald-900 text-yellow-400 text-xs font-bold rounded-xl">+ Nouvelle opportunité</button>
            </div>
          </div>
          <div class="crm-pipeline-scroll overflow-x-auto pb-3 -mx-1 px-1"><div class="flex gap-4 items-start min-w-max">
            ${groups.map(({ stage, rows, amount }) => `
              <section class="w-[84vw] sm:w-[300px] shrink-0 bg-slate-100/80 border border-slate-200 rounded-3xl p-3">
                <div class="flex items-center justify-between px-1 py-1"><span class="badge-status badge-crm-${stage}">${CRM_STAGE_LABELS[stage]}</span><span class="text-[10px] font-bold text-slate-500">${rows.length} · ${formatMoney(amount)}</span></div>
                <div class="space-y-3 mt-3">${rows.length === 0 ? '<div class="text-center text-[11px] text-slate-400 py-8">Aucune opportunité</div>' : rows.map(item => `
                  <article class="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                    <h5 class="font-bold text-xs text-slate-800 leading-snug">${escapeHtml(item.title)}</h5>
                    <button type="button" data-crm-action="view-contact" data-id="${Number(item.contact_id)}" class="text-[11px] text-emerald-700 font-bold hover:underline mt-1 text-left">${escapeHtml(item.contact_name)}${item.contact_organization ? ` · ${escapeHtml(item.contact_organization)}` : ''}</button>
                    <div class="flex items-center justify-between mt-3 text-[11px]"><span class="font-black text-emerald-800">${formatMoney(item.amount, item.currency)}</span><span class="text-slate-400">${escapeHtml(CRM_OPPORTUNITY_TYPE_LABELS[item.type] || item.type)}</span></div>
                    <div class="mt-3"><div class="flex justify-between text-[9px] font-bold text-slate-400 uppercase"><span>Probabilité</span><span>${Number(item.probability || 0)}%</span></div><div class="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden"><div class="h-full bg-emerald-600" style="width:${Math.min(100, Math.max(0, Number(item.probability || 0)))}%"></div></div></div>
                    <div class="text-[10px] text-slate-400 mt-3">${item.owner_name ? `Responsable : ${escapeHtml(item.owner_name)}` : 'Non assignée'}${item.expected_close_date ? ` · Clôture : ${formatDate(item.expected_close_date)}` : ''}</div>
                    <label class="block text-[9px] font-black uppercase tracking-widest text-slate-400 mt-4 mb-1">Étape</label>
                    <select data-crm-stage-select="${Number(item.id)}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white">${optionsHtml(CRM_STAGE_LABELS, item.stage)}</select>
                    <div class="flex gap-1.5 mt-3">
                      <button type="button" data-crm-action="edit-opportunity" data-id="${Number(item.id)}" class="flex-1 px-3 py-2 bg-slate-100 rounded-xl text-[11px] font-bold">Modifier</button>
                      <button type="button" data-crm-action="new-activity" data-contact-id="${Number(item.contact_id)}" data-opportunity-id="${Number(item.id)}" class="flex-1 px-3 py-2 bg-blue-50 text-blue-800 rounded-xl text-[11px] font-bold">+ Activité</button>
                      <button type="button" data-crm-action="delete-opportunity" data-id="${Number(item.id)}" class="px-3 py-2 bg-red-50 text-red-700 rounded-xl text-[11px] font-bold"><i class="fas fa-trash"></i></button>
                    </div>
                  </article>`).join('')}</div>
              </section>`).join('')}
          </div></div>
        </div>`;
    }

    async function renderCrmActivities(target) {
      const activities = await portal.listCrmActivities();
      crmActivities = activities;
      const tasks = activities.filter(item => item.status === 'a_faire').sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || String(a.due_at || '').localeCompare(String(b.due_at || '')));
      const timeline = activities.filter(item => item.status !== 'a_faire').slice(0, 30);
      target.innerHTML = `
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section class="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div class="p-5 border-b border-slate-100 flex items-center justify-between gap-3"><div><h4 class="text-sm font-bold">Tâches & relances à faire</h4><p class="text-[11px] text-slate-500">En retard en premier.</p></div><button type="button" data-crm-action="new-activity" class="px-4 py-2.5 bg-emerald-900 text-yellow-400 text-xs font-bold rounded-xl shrink-0">+ Tâche / activité</button></div>
            <div class="divide-y divide-slate-100">${tasks.length === 0 ? '<div class="p-10 text-center text-xs text-slate-400">Aucune tâche en attente.</div>' : tasks.map(item => `
              <div class="p-4 flex items-start gap-3 ${isOverdue(item) ? 'bg-red-50/70' : ''}">
                <span class="w-9 h-9 rounded-xl ${isOverdue(item) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'} flex items-center justify-center shrink-0"><i class="fas fa-clock text-xs"></i></span>
                <div class="flex-1 min-w-0"><strong class="text-xs text-slate-800">${escapeHtml(item.title)}</strong> <span class="badge-status ${isOverdue(item) ? 'badge-crm-perdu' : 'badge-crm-contacte'}">${isOverdue(item) ? 'En retard' : escapeHtml(CRM_ACTIVITY_TYPE_LABELS[item.type] || item.type)}</span><br>
                <button type="button" data-crm-action="view-contact" data-id="${Number(item.contact_id)}" class="text-[11px] text-emerald-700 font-bold hover:underline mt-1">${escapeHtml(item.contact_name)}</button>
                ${item.opportunity_title ? `<div class="text-[10px] text-slate-500">${escapeHtml(item.opportunity_title)}</div>` : ''}${item.details ? `<p class="text-[11px] text-slate-500 mt-1">${escapeHtml(item.details)}</p>` : ''}<div class="text-[10px] text-slate-400 mt-1">Échéance : ${formatDate(item.due_at, true)}</div></div>
                <button type="button" data-crm-action="complete-activity" data-id="${Number(item.id)}" class="px-3 py-2 bg-emerald-900 text-yellow-400 text-[11px] font-bold rounded-xl shrink-0">Terminer</button>
              </div>`).join('')}</div>
          </section>
          <section class="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div class="p-5 border-b border-slate-100"><h4 class="text-sm font-bold">Historique récent</h4><p class="text-[11px] text-slate-500">Notes, appels, emails, réunions et tâches terminées.</p></div>
            <div class="divide-y divide-slate-100 max-h-[720px] overflow-y-auto">${timeline.length === 0 ? '<div class="p-10 text-center text-xs text-slate-400">Aucune activité enregistrée.</div>' : timeline.map(item => `
              <div class="p-4 flex items-start gap-3"><span class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><i class="fas fa-note-sticky text-xs"></i></span>
              <div class="flex-1 min-w-0"><strong class="text-xs text-slate-800">${escapeHtml(item.title)}</strong><div class="text-[10px] text-slate-400 mt-0.5">${formatDate(item.created_at, true)} · ${escapeHtml(CRM_ACTIVITY_TYPE_LABELS[item.type] || item.type)}</div>
              <button type="button" data-crm-action="view-contact" data-id="${Number(item.contact_id)}" class="text-[11px] text-emerald-700 font-bold hover:underline mt-1">${escapeHtml(item.contact_name)}</button>${item.details ? `<p class="text-[11px] text-slate-500 mt-1">${escapeHtml(item.details)}</p>` : ''}</div>
              <button type="button" data-crm-action="delete-activity" data-id="${Number(item.id)}" class="text-red-500 text-xs shrink-0"><i class="fas fa-trash"></i></button></div>`).join('')}</div>
          </section>
        </div>`;
    }

    async function openContactModal(contactId = null) {
      const contact = contactId ? await portal.getCrmContact(contactId) : null;
      openCrmModal(contact ? 'Modifier le contact CRM' : 'Nouveau contact CRM', `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div><label class="block font-bold mb-1">Nom complet *</label><input id="sb-crm-contact-name" type="text" value="${escapeHtml(contact?.full_name || '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Organisation</label><input id="sb-crm-contact-organization" type="text" value="${escapeHtml(contact?.organization || '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Email *</label><input id="sb-crm-contact-email" type="email" value="${escapeHtml(contact?.email || '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Téléphone</label><input id="sb-crm-contact-phone" type="tel" value="${escapeHtml(contact?.phone || '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Type</label><select id="sb-crm-contact-type" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${optionsHtml(CRM_CONTACT_TYPE_LABELS, contact?.type || 'prospect')}</select></div>
          <div><label class="block font-bold mb-1">Statut</label><select id="sb-crm-contact-status" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${optionsHtml(CRM_CONTACT_STATUS_LABELS, contact?.status || 'nouveau')}</select></div>
          <div><label class="block font-bold mb-1">Pays</label><input id="sb-crm-contact-country" type="text" value="${escapeHtml(contact?.country || 'RDC')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Ville / Localisation</label><input id="sb-crm-contact-location" type="text" value="${escapeHtml(contact?.location || '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Secteur</label><input id="sb-crm-contact-sector" type="text" value="${escapeHtml(contact?.sector || '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Responsable</label><select id="sb-crm-contact-owner" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${ownersOptions(contact?.owner_id || currentProfile?.id)}</select></div>
          <div class="sm:col-span-2"><label class="block font-bold mb-1">Tags</label><input id="sb-crm-contact-tags" type="text" value="${escapeHtml(contact?.tags || '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div class="sm:col-span-2"><label class="block font-bold mb-1">Notes internes</label><textarea id="sb-crm-contact-notes" rows="4" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${escapeHtml(contact?.notes || '')}</textarea></div>
        </div>`, async () => {
          const payload = {
            full_name: optionalEl('sb-crm-contact-name').value,
            organization: optionalEl('sb-crm-contact-organization').value,
            email: optionalEl('sb-crm-contact-email').value,
            phone: optionalEl('sb-crm-contact-phone').value,
            type: optionalEl('sb-crm-contact-type').value,
            status: optionalEl('sb-crm-contact-status').value,
            country: optionalEl('sb-crm-contact-country').value,
            location: optionalEl('sb-crm-contact-location').value,
            sector: optionalEl('sb-crm-contact-sector').value,
            owner_id: optionalEl('sb-crm-contact-owner').value || null,
            tags: optionalEl('sb-crm-contact-tags').value,
            notes: optionalEl('sb-crm-contact-notes').value,
            source: contact?.source || 'manuel',
            source_ref_type: contact?.source_ref_type || null,
            source_ref_id: contact?.source_ref_id || null,
            last_contacted_at: contact?.last_contacted_at || null
          };
          await portal.saveCrmContact(payload, contact?.id || null);
          showCrmToast(contact ? 'Contact CRM mis à jour.' : 'Contact CRM créé.');
          await showCRM(currentProfile);
        });
    }

    async function openContactDetail(contactId) {
      const contact = await portal.getCrmContact(contactId);
      openCrmModal(`Fiche CRM — ${contact.full_name}`, `
        <div class="space-y-5 text-xs">
          <div class="flex flex-wrap gap-2"><span class="badge-status badge-crm-${contact.status === 'archive' ? 'archive' : contact.status === 'actif' ? 'actif' : contact.status === 'inactif' ? 'inactif' : 'nouveau'}">${escapeHtml(CRM_CONTACT_STATUS_LABELS[contact.status] || contact.status)}</span><span class="px-2.5 py-1 rounded-full bg-slate-100 font-bold">${escapeHtml(CRM_CONTACT_TYPE_LABELS[contact.type] || contact.type)}</span><span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold">Source : ${escapeHtml(contact.source || 'manuel')}</span></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div><span class="text-slate-400 font-bold block">Organisation</span>${escapeHtml(contact.organization || '—')}</div>
            <div><span class="text-slate-400 font-bold block">Responsable</span>${escapeHtml(contact.owner_name || 'Non assigné')}</div>
            <div><span class="text-slate-400 font-bold block">Email</span><a class="text-emerald-700 font-bold break-all" href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></div>
            <div><span class="text-slate-400 font-bold block">Téléphone</span>${escapeHtml(contact.phone || '—')}</div>
            <div><span class="text-slate-400 font-bold block">Secteur</span>${escapeHtml(contact.sector || '—')}</div>
            <div><span class="text-slate-400 font-bold block">Localisation</span>${escapeHtml([contact.location, contact.country].filter(Boolean).join(', ') || '—')}</div>
            <div><span class="text-slate-400 font-bold block">Dernier contact</span>${formatDate(contact.last_contacted_at, true)}</div>
            <div><span class="text-slate-400 font-bold block">Créé le</span>${formatDate(contact.created_at, true)}</div>
          </div>
          ${contact.notes ? `<div class="bg-amber-50 border border-amber-100 rounded-2xl p-4"><strong>Notes internes</strong><p class="mt-1 text-slate-600 leading-relaxed">${escapeHtml(contact.notes)}</p></div>` : ''}
          <div class="flex flex-wrap gap-2">
            <button type="button" data-crm-action="edit-contact" data-id="${Number(contact.id)}" class="px-4 py-2 bg-slate-100 rounded-xl font-bold">Modifier</button>
            <button type="button" data-crm-action="new-opportunity" data-contact-id="${Number(contact.id)}" class="px-4 py-2 bg-emerald-900 text-yellow-400 rounded-xl font-bold">+ Opportunité</button>
            <button type="button" data-crm-action="new-activity" data-contact-id="${Number(contact.id)}" class="px-4 py-2 bg-blue-50 text-blue-800 rounded-xl font-bold">+ Activité / relance</button>
            ${contact.status !== 'archive' ? `<button type="button" data-crm-action="archive-contact" data-id="${Number(contact.id)}" class="px-4 py-2 bg-red-50 text-red-700 rounded-xl font-bold">Archiver</button>` : ''}
          </div>
          <div><h4 class="font-bold mb-3">Opportunités (${contact.opportunities.length})</h4><div class="space-y-2">${contact.opportunities.length === 0 ? '<p class="text-slate-400">Aucune opportunité liée.</p>' : contact.opportunities.map(item => `<div class="border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"><div><strong>${escapeHtml(item.title)}</strong><div class="text-[10px] text-slate-400 mt-1">${formatMoney(item.amount, item.currency)} · ${Number(item.probability || 0)}%</div></div><div class="flex items-center gap-2"><span class="badge-status badge-crm-${item.stage}">${CRM_STAGE_LABELS[item.stage] || item.stage}</span><button type="button" data-crm-action="edit-opportunity" data-id="${Number(item.id)}" class="px-3 py-1.5 bg-slate-100 rounded-xl font-bold">Modifier</button></div></div>`).join('')}</div></div>
          <div><h4 class="font-bold mb-3">Historique & tâches (${contact.activities.length})</h4><div class="space-y-2 max-h-72 overflow-y-auto">${contact.activities.length === 0 ? '<p class="text-slate-400">Aucune activité enregistrée.</p>' : contact.activities.map(item => `<div class="border border-slate-100 bg-slate-50 rounded-2xl p-3"><div class="flex justify-between gap-2"><strong>${escapeHtml(item.title)}</strong><span class="text-[9px] font-bold ${isOverdue(item) ? 'text-red-700' : 'text-slate-400'}">${isOverdue(item) ? 'EN RETARD' : escapeHtml(CRM_ACTIVITY_TYPE_LABELS[item.type] || item.type)}</span></div>${item.details ? `<p class="text-slate-500 mt-1">${escapeHtml(item.details)}</p>` : ''}<div class="text-[10px] text-slate-400 mt-1">${formatDate(item.created_at, true)}${item.due_at ? ` · Échéance ${formatDate(item.due_at, true)}` : ''}${item.status === 'a_faire' ? ` · <button type="button" data-crm-action="complete-activity" data-id="${Number(item.id)}" data-contact-id="${Number(contact.id)}" class="text-emerald-700 font-black">Marquer terminée</button>` : ''}</div></div>`).join('')}</div></div>
        </div>`);
    }

    async function openOpportunityModal(opportunityId = null, contactId = null) {
      crmContacts = await portal.listCrmContacts({});
      let opportunity = null;
      if (opportunityId) {
        opportunity = crmOpportunities.find(item => String(item.id) === String(opportunityId));
        if (!opportunity) {
          crmOpportunities = await portal.listCrmOpportunities();
          opportunity = crmOpportunities.find(item => String(item.id) === String(opportunityId));
        }
      }
      if (!crmContacts.some(contact => contact.status !== 'archive')) throw new Error('Créez ou synchronisez d’abord un contact CRM.');
      openCrmModal(opportunity ? 'Modifier l’opportunité CRM' : 'Nouvelle opportunité CRM', `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="sm:col-span-2"><label class="block font-bold mb-1">Contact *</label><select id="sb-crm-opp-contact" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${contactsOptions(opportunity?.contact_id || contactId || '')}</select></div>
          <div class="sm:col-span-2"><label class="block font-bold mb-1">Titre *</label><input id="sb-crm-opp-title" type="text" value="${escapeHtml(opportunity?.title || '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Type</label><select id="sb-crm-opp-type" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${optionsHtml(CRM_OPPORTUNITY_TYPE_LABELS, opportunity?.type || 'commerciale')}</select></div>
          <div><label class="block font-bold mb-1">Étape</label><select id="sb-crm-opp-stage" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${optionsHtml(CRM_STAGE_LABELS, opportunity?.stage || 'nouveau')}</select></div>
          <div><label class="block font-bold mb-1">Montant</label><input id="sb-crm-opp-amount" type="number" min="0" step="any" value="${Number(opportunity?.amount || 0)}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Devise</label><select id="sb-crm-opp-currency" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${['USD', 'CDF', 'EUR'].map(value => `<option value="${value}" ${opportunity?.currency === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
          <div><label class="block font-bold mb-1">Probabilité (%)</label><input id="sb-crm-opp-probability" type="number" min="0" max="100" value="${Number(opportunity?.probability ?? 10)}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Clôture prévue</label><input id="sb-crm-opp-close" type="date" value="${escapeHtml(opportunity?.expected_close_date ? String(opportunity.expected_close_date).slice(0, 10) : '')}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div class="sm:col-span-2"><label class="block font-bold mb-1">Responsable</label><select id="sb-crm-opp-owner" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${ownersOptions(opportunity?.owner_id || currentProfile?.id)}</select></div>
          <div class="sm:col-span-2"><label class="block font-bold mb-1">Description / prochaines étapes</label><textarea id="sb-crm-opp-description" rows="4" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${escapeHtml(opportunity?.description || '')}</textarea></div>
        </div>`, async () => {
          const payload = {
            contact_id: optionalEl('sb-crm-opp-contact').value,
            title: optionalEl('sb-crm-opp-title').value,
            type: optionalEl('sb-crm-opp-type').value,
            stage: optionalEl('sb-crm-opp-stage').value,
            amount: optionalEl('sb-crm-opp-amount').value,
            currency: optionalEl('sb-crm-opp-currency').value,
            probability: optionalEl('sb-crm-opp-probability').value,
            expected_close_date: optionalEl('sb-crm-opp-close').value || null,
            owner_id: optionalEl('sb-crm-opp-owner').value || null,
            description: optionalEl('sb-crm-opp-description').value,
            source: opportunity?.source || 'manuel',
            source_ref_type: opportunity?.source_ref_type || null,
            source_ref_id: opportunity?.source_ref_id || null
          };
          await portal.saveCrmOpportunity(payload, opportunity?.id || null);
          showCrmToast(opportunity ? 'Opportunité CRM mise à jour.' : 'Opportunité CRM créée.');
          crmTab = 'pipeline';
          await showCRM(currentProfile);
        });
    }

    async function populateActivityOpportunities(contactId, selectedId) {
      const select = optionalEl('sb-crm-activity-opportunity');
      if (!select) return;
      select.innerHTML = '<option value="">Aucune opportunité liée</option>';
      if (!contactId) return;
      const opportunities = await portal.listCrmOpportunities({ contactId });
      opportunities.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.title;
        select.appendChild(option);
      });
      if (selectedId) select.value = String(selectedId);
    }

    async function openActivityModal(contactId = null, opportunityId = null) {
      crmContacts = await portal.listCrmContacts({});
      if (!crmContacts.some(contact => contact.status !== 'archive')) throw new Error('Créez ou synchronisez d’abord un contact CRM.');
      openCrmModal('Nouvelle activité / relance CRM', `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div><label class="block font-bold mb-1">Contact *</label><select id="sb-crm-activity-contact" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${contactsOptions(contactId || '')}</select></div>
          <div><label class="block font-bold mb-1">Opportunité liée</label><select id="sb-crm-activity-opportunity" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"><option value="">Aucune opportunité liée</option></select></div>
          <div><label class="block font-bold mb-1">Type</label><select id="sb-crm-activity-type" class="w-full px-4 py-2.5 rounded-xl border border-slate-200">${optionsHtml(CRM_ACTIVITY_TYPE_LABELS, 'tache')}</select></div>
          <div><label class="block font-bold mb-1">Statut</label><select id="sb-crm-activity-status" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"><option value="a_faire" selected>À faire / relance</option><option value="terminee">Terminée (historique)</option><option value="annulee">Annulée</option></select></div>
          <div class="sm:col-span-2"><label class="block font-bold mb-1">Titre *</label><input id="sb-crm-activity-title" type="text" placeholder="Ex. Relancer le prospect par téléphone" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block font-bold mb-1">Échéance</label><input id="sb-crm-activity-due" type="datetime-local" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></div>
          <div class="flex items-end"><p class="text-[10px] text-slate-400">Les tâches en retard apparaissent en rouge et alimentent le badge CRM.</p></div>
          <div class="sm:col-span-2"><label class="block font-bold mb-1">Détails</label><textarea id="sb-crm-activity-details" rows="4" class="w-full px-4 py-2.5 rounded-xl border border-slate-200"></textarea></div>
        </div>`, async () => {
          const dueValue = optionalEl('sb-crm-activity-due').value;
          await portal.saveCrmActivity({
            contact_id: optionalEl('sb-crm-activity-contact').value,
            opportunity_id: optionalEl('sb-crm-activity-opportunity').value || null,
            type: optionalEl('sb-crm-activity-type').value,
            status: optionalEl('sb-crm-activity-status').value,
            title: optionalEl('sb-crm-activity-title').value,
            due_at: dueValue ? new Date(dueValue).toISOString() : null,
            details: optionalEl('sb-crm-activity-details').value,
            created_by: currentProfile?.id || null
          });
          showCrmToast('Activité CRM enregistrée.');
          crmTab = 'activities';
          await showCRM(currentProfile);
        });
      await populateActivityOpportunities(contactId || optionalEl('sb-crm-activity-contact')?.value, opportunityId);
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      errorBox.classList.add('hidden');
      button.disabled = true;
      try {
        const profile = await portal.signIn(document.getElementById('login-email').value, document.getElementById('login-password').value);
        document.getElementById('login-password').value = '';
        await showDashboard(profile);
      } catch (err) {
        showError(err.message);
      } finally {
        button.disabled = false;
      }
    });

    try {
      const profile = await portal.restore();
      if (profile) await showDashboard(profile);
    } catch (err) {
      showError(err.message);
    } finally {
      button.disabled = false;
    }
  }

  const exported = { createPortal, start };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (root) root.SupabaseAdmin = exported;
})(typeof window !== 'undefined' ? window : null);
