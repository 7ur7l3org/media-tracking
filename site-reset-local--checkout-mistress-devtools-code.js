// thanks https://chatgpt.com/c/69d741f3-17a8-832f-9ebf-97499978960c
// TODO possibly bookmarklet this..
// essentially local diverged branches are cool and all but sometimes they're just fucked and have no value and i really just want to not be on them and want to re-clone and have the site be fixed
(async () => {
  const login = await getLogin();
  if (!login?.token) throw new Error("No login token");

  await git.fetch({
    fs: pfs,
    http: window.GitHttp,
    dir: repoDir,
    onAuth: () => ({
      username: "x-access-token",
      password: login.token,
      oauth2format: "github",
    }),
    corsProxy: login.corsProxy,
  });

  const walk = async (root) => {
    const out = [];
    const go = async (dir) => {
      let names;
      try { names = await pfs.readdir(dir); } catch { return; }
      for (const name of names.sort()) {
        const full = `${dir}/${name}`;
        const st = await pfs.lstat(full);
        if (st.isDirectory()) await go(full);
        else out.push(full.replace(`${repoDir}/.git/`, ""));
      }
    };
    await go(`${repoDir}/.git/${root}`);
    return out.sort();
  };

  const current = await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false });
  const localRefs = await walk("refs/heads");
  const remoteRefs = await walk("refs/remotes/origin");
  const allRefs = ["HEAD", ...localRefs, ...remoteRefs];

  const remoteTips = new Set(
    await Promise.all(remoteRefs.map(ref =>
      git.resolveRef({ fs: pfs, dir: repoDir, ref })
    ))
  );

  const lines = [];
  for (const ref of allRefs) {
    const isLocal = ref.startsWith("refs/heads/");
    const short = isLocal ? ref.slice("refs/heads/".length) : "";
    const checkedOut = ref === "HEAD" || (isLocal && short === current);
    const localTipSeenOnOrigin = isLocal
      ? remoteTips.has(await git.resolveRef({ fs: pfs, dir: repoDir, ref }))
      : null;

    lines.push(
      `${checkedOut ? "* " : "  "}${ref}` +
      (isLocal ? ` | localTipSeenOnOrigin=${localTipSeenOnOrigin}` : "")
    );
  }

  console.log(lines.join("\n"));

  if (!confirm("Checkout mistress now?")) return;

  await git.checkout({
    fs: pfs,
    dir: repoDir,
    ref: "mistress",
  });

  console.log("now on:", await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false }), "(refresh)");
})();