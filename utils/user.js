function pickUser(user) {
    return {
      id: user._id.toString(),
      email: user.email ?? null,
      name: user.name ?? null,
      picture: user.picture ?? null,
      nickname: user.nickname ?? null,
    };
  }
  
  module.exports = { pickUser };