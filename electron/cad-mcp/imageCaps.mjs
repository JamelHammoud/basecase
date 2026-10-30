const KIND = process.env.CAD_AGENT_KIND || 'claude';
const TODAY = { photo: 1568, render: 1024, detail: 1024 };
const CAPS = { claude: { photo: 2000, render: 1024, detail: 2000 } };

export const imageCaps = () => CAPS[KIND] ?? TODAY;
