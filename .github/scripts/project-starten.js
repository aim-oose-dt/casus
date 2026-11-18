const fs = require("node:fs");
const path = require("node:path");

module.exports = async function startProject({ github, context, core }) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const configPath = path.join(process.env.GITHUB_WORKSPACE, ".github", "project-starten.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  for (const label of config.labels) {
    try {
      await github.rest.issues.getLabel({ owner, repo, name: label.name });
    } catch (error) {
      if (error.status !== 404) throw error;
      await github.rest.issues.createLabel({ owner, repo, ...label });
      core.info(`Label aangemaakt: ${label.name}`);
    }
  }

  const existingMilestones = await github.paginate(
    github.rest.issues.listMilestones,
    { owner, repo, state: "all", per_page: 100 }
  );
  const milestoneNumbers = new Map(
    existingMilestones.map(milestone => [milestone.title, milestone.number])
  );

  for (const milestone of config.milestones) {
    if (milestoneNumbers.has(milestone.title)) continue;

    const created = await github.rest.issues.createMilestone({
      owner,
      repo,
      title: milestone.title,
      due_on: milestone.dueOn
    });
    milestoneNumbers.set(milestone.title, created.data.number);
    core.info(`Milestone aangemaakt: ${milestone.title}`);
  }

  const existingIssues = await github.paginate(
    github.rest.issues.listForRepo,
    { owner, repo, state: "all", per_page: 100 }
  );
  const existingTitles = new Set(
    existingIssues.filter(issue => !issue.pull_request).map(issue => issue.title)
  );

  let createdCount = 0;
  for (const issue of config.issues) {
    if (existingTitles.has(issue.title)) {
      core.info(`Overgeslagen, bestaat al: ${issue.title}`);
      continue;
    }

    const milestone = milestoneNumbers.get(issue.milestone);
    if (!milestone) {
      throw new Error(`Onbekende milestone voor issue '${issue.title}': ${issue.milestone}`);
    }

    const body = [
      issue.description,
      "",
      `**Streefdatum:** ${issue.targetDate}`,
      "",
      "## Acceptatiecriteria",
      "",
      "- [ ] Resultaat is opgenomen in de repository.",
      "- [ ] Keuzes zijn onderbouwd.",
      "- [ ] Het resultaat is door een teamlid gereviewd.",
      "- [ ] Relevante beoordelingscriteria zijn gekoppeld en onderbouwd.",
      "",
      "## Verantwoordelijk",
      "",
      "Wijs dit issue toe aan een of meer teamleden."
    ].join("\n");

    await github.rest.issues.create({
      owner,
      repo,
      title: issue.title,
      body,
      labels: issue.labels,
      milestone
    });
    createdCount += 1;
    core.info(`Issue aangemaakt: ${issue.title}`);
  }

  await core.summary
    .addHeading("Projectplanning gestart")
    .addRaw(`${createdCount} nieuwe issues aangemaakt. Bestaande issues zijn overgeslagen.`)
    .write();
};
