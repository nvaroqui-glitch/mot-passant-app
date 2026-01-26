module.exports = async (req, res) => {
  try {
    // On accepte GET juste pour tester dans le navigateur
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, hint: "Use POST with Authorization Bearer token" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({ error: "Missing SUPABASE env vars" });
    }

    // ✅ VERROU: l’appel doit venir d’un utilisateur connecté
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    // Vérif du token via l’API Supabase (sans librairie)
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": anonKey
      }
    });

    if (!r.ok) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const user = await r.json();
    return res.status(200).json({ ok: true, user_id: user.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server crashed" });
  }
};
