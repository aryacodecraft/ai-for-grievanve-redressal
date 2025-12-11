import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAuthService = {
  signup: async (email, password, userData) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: userData.name,
          phone: userData.phone
        }
      }
    });

    if (error) throw error;

    if (data.user) {
      await supabase.from('profiles').insert([
        {
          id: data.user.id,
          name: userData.name,
          email: email,
          phone: userData.phone,
          role: 'citizen'
        }
      ]);
    }

    return data;
  },

  signin: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        ...profileData
      },
      token: data.session.access_token
    };
  },

  signout: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  getCurrentUser: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return {
      id: data.user.id,
      email: data.user.email,
      ...profileData
    };
  },

  getSession: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  }
};

export const supabaseGrievanceService = {
  createGrievance: async (userId, grievanceData) => {
    const { data, error } = await supabase
      .from('grievances')
      .insert([
        {
          user_id: userId,
          category: grievanceData.category,
          subject: grievanceData.subject,
          description: grievanceData.description,
          department: grievanceData.department,
          priority: grievanceData.priority,
          status: 'pending'
        }
      ])
      .select();

    if (error) throw error;
    return data[0];
  },

  getUserGrievances: async (userId) => {
    const { data, error } = await supabase
      .from('grievances')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  getAllGrievances: async () => {
    const { data, error } = await supabase
      .from('grievances')
      .select(`
        *,
        profiles(name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data.map(g => ({
      ...g,
      userName: g.profiles?.name,
      userEmail: g.profiles?.email
    }));
  },

  updateGrievanceStatus: async (grievanceId, status, remarks) => {
    const { data, error } = await supabase
      .from('grievances')
      .update({
        status,
        remarks,
        updated_at: new Date()
      })
      .eq('id', grievanceId)
      .select();

    if (error) throw error;
    return data[0];
  },

  getGrievanceById: async (id) => {
    const { data, error } = await supabase
      .from('grievances')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }
};

export const supabaseUserService = {
  getAllUsers: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  getUserById: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  updateUserProfile: async (userId, updates) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select();

    if (error) throw error;
    return data[0];
  },

  updateUserRole: async (userId, role) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select();

    if (error) throw error;
    return data[0];
  }
};

export const supabaseStatsService = {
  getAdminStats: async () => {
    const grievancesResp = await supabase
      .from('grievances')
      .select('status', { count: 'exact' });

    const usersResp = await supabase
      .from('profiles')
      .select('*', { count: 'exact' });

    const grievances = grievancesResp.data || [];

    return {
      totalGrievances: grievancesResp.count || 0,
      pendingGrievances: grievances.filter(g => g.status === 'pending').length,
      resolvedGrievances: grievances.filter(g => g.status === 'resolved').length,
      totalUsers: usersResp.count || 0,
      resolutionRate: 85,
      avgResolutionTime: 5,
      todaySubmissions: 0
    };
  },

  getUserStats: async (userId) => {
    const { data, error } = await supabase
      .from('grievances')
      .select('status')
      .eq('user_id', userId);

    if (error) return { total: 0, pending: 0, inProgress: 0, resolved: 0 };

    return {
      total: data.length,
      pending: data.filter(g => g.status === 'pending').length,
      inProgress: data.filter(g => g.status === 'in-progress').length,
      resolved: data.filter(g => g.status === 'resolved').length
    };
  }
};
