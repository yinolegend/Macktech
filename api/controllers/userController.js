function createUserController({ db, ad }) {
  return {
    listUsers: async (req, res) => {
      try {
        const users = await db.allUsers();
        return res.json(users);
      } catch (error) {
        console.error('users', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to list users' });
      }
    },

    searchAdUsers: async (req, res) => {
      try {
        if (!ad || !ad.configured || !ad.configured()) return res.status(404).json([]);
        const query = String(req.query.q || '').trim();
        const users = await ad.searchUsers(query, 50);
        return res.json(users);
      } catch (error) {
        console.error('ad users', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to search ad users' });
      }
    },
  };
}

module.exports = {
  createUserController,
};
