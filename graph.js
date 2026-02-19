const width = window.innerWidth;
const height = window.innerHeight;
const TEXT_MAX_WIDTH = 80;
const TEXT_FONT = "12px sans-serif";
const textContext = document.createElement("canvas").getContext("2d");
textContext.font = TEXT_FONT;


/* ---------------- SVG + ZOOM ---------------- */

const svg = d3.select("#graph").append("svg")
  .attr("width", width)
  .attr("height", height)
  .call(
    d3.zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      })
  );

svg.on("dblclick.zoom", null);

// Background rect to catch pan
svg.append("rect")
  .attr("width", width)
  .attr("height", height)
  .attr("fill", "transparent")
  .style("pointer-events", "all");

const container = svg.append("g");

/* ---------------- FORCE SIMULATION ---------------- */

const simulation = d3.forceSimulation()
  .force("link", d3.forceLink().id(d => d.id).distance(180)) // distance between linked nodes = edges length
  .force("charge", d3.forceManyBody().strength(-300))
  .force("center", d3.forceCenter(width / 2, height / 2));

/* ---------------- DATA ---------------- */

let fullGraph = { nodes: [], edges: [] };
let visibleGraph = { nodes: [], edges: [] };

// Color scheme
const colorScale = d3.scaleOrdinal()
  .domain(["HIMO", "Fonds", "Subfonds", "Series", "Context", "PendingFonds"])
  .range(["#020048", "#88bfe7", "#c2def2", "#ebebf8", "#bc98df", "#56beb9"]);

// Manually force breaks and unbreakable spaces for specific long node names
const MANUAL_BREAKS_BY_NAME = {
  "History of Management and Administrative Management": "History of Management and Admini- strative Management",
  // Feredal agencies and think tanks
  "Archives of the US Senate": "Archives of the US\nSenate",
  // Insitutional networks and learned societies
  "Institutional Networks, Learned Societies and Doctrinal Knowledge about Management":"Institutional Networks, Learned\u00A0Societies and Doctrinal Knowledge\u00A0about Management",
  "Archives of the Society of the Advancement of Management": "Archives of the Society of\u00A0the Advancement\u00A0of Management",
  // Academic journals
  // Business schools and consulting corporations
  "Bulletin of the HBS": "Bulletin of\nthe HBS",
  // Computer history, electronic brains and managerial techniques
  "Archives about the history of cybernetics (Macy Proceedings – 1942 and 1946-1953)": "Archives about\u00A0the\u00A0history of cybernetics (Macy\u00A0Proceedings\u00A0– 1942 and 1946-1953)",
  "Archives about the history of organizational and managerial techniques":"Archives about\u00A0the\u00A0history of\u00A0organizational and\u00A0managerial techniques",
  // Industrial actors
  // Archives of contextualization
  "Archives of Contextualization": "Archives of Contextua- lization",
  "Literature Review: History of Management and Administrative Management in the US (1920-1950)":"Literature Review:\u00A0History of\u00A0Management and\u00A0Administrative Management in the US (1920-1950)",
  // Extra archives
  "Possible extra-archives": "Possible\nextra-\narchives",
};

// Manually force extra padding
const EXTRA_PADDING_BY_NAME = {
  // Business schools and consulting corporations
  "Business Schools & Consulting Corporations": 10,
  // Insitutional networks and learned societies
  "Institutional Networks, Learned Societies and Doctrinal Knowledge about Management": 10,
  // Computer history, electronic brains and managerial techniques
  "Computer History, Electronic Brains and Managerial Techniques": 7,
};


/* ---------------- HELPERS ---------------- */

// Detect expandable nodes
function isExpandable(node) {
  return fullGraph.edges.some(e => e.source === node.id);
}

// Multiline text with manual breaks and dynamic wrapping
function wrapText(d, width = TEXT_MAX_WIDTH) {
  if (!d || !d.attributes || !d.attributes.name) return [];

  const context = textContext;

  // Use manual break if defined, else use actual name
  const rawText = MANUAL_BREAKS_BY_NAME[d.attributes.name] || d.attributes.name;

  // Split by existing newlines first
  const lines = rawText.split(/\n/);
  const wrappedLines = [];

  lines.forEach(line => {
    // const words = line.split(/\s+/);
    const words = line.split(/ /); // keep non-breaking words together (\u00A0)
    let currentLine = [];

    // Tentatively add this word to the current line and measure width
    words.forEach(word => {
      const testLine = [...currentLine, word].join(" ");
      // If adding the word exceeds the max width, start a new line
      if (
        context.measureText(testLine).width > width &&
        currentLine.length > 0
      ) {
        wrappedLines.push(currentLine.join(" "));
        currentLine = [word];
      } else {currentLine.push(word);}
    });

    if (currentLine.length > 0) {
      wrappedLines.push(currentLine.join(" "));
    }
  });

  return wrappedLines;
}

// Adjust circle size based on text
function computeCircleRadius(d, maxWidth = TEXT_MAX_WIDTH, fontSize = 12, basePadding = 10, minRadius = 48) {
  const lines = wrapText(d, maxWidth);
  const context = textContext;

  // Text width
  let maxLineWidth = 0;
  lines.forEach(line => {
    const w = context.measureText(line).width;
    if (w > maxLineWidth) maxLineWidth = w;
  });

  // Text height
  const lineHeight = fontSize + 2;
  const verticalSize = lines.length * lineHeight;

  // Padding
  const name = d.attributes?.name;
  const extraPadding = EXTRA_PADDING_BY_NAME[name] ?? 0;
  const padding = basePadding + extraPadding;
  //! Old version to dynamically define extra padding
  // First / last words to detect very long words that would require more padding
  // const rawText = manualBreaks[d.attributes.name] || d.attributes.name;
  // const words = rawText.replace(/\n+/g, " ").trim().split(/\s+/);
  // const firstWord = words[0];
  // const lastWord = words[words.length - 1];
  // const firstWordWidth = context.measureText(firstWord).width;
  // const lastWordWidth = context.measureText(lastWord).width;
  // const LONG_WORD_THRESHOLD = maxWidth * 0.9;
  // const longFirstOrLast = firstWordWidth > LONG_WORD_THRESHOLD || lastWordWidth > LONG_WORD_THRESHOLD;
  // const isLongText = lines.length >= 4;
  // if (longFirstOrLast && isLongText) {padding = 16;}

  // Final circle radius
  const radius = Math.max(maxLineWidth / 2, verticalSize / 2) + padding;

  // Ensure minimum radius
  return Math.max(radius, minRadius);
}


/* ---------------- INITIALIZE GRAPH ---------------- */

d3.json("graph.json").then(data => {
  fullGraph = data;

  // Find root node (HIMO)
  const root = fullGraph.nodes.find(d => d.labels[0] === "HIMO");
  root.x = width/2;
  root.y = height/2;
  visibleGraph.nodes = [root];

  // Initialize visible graph with root only
  visibleGraph.nodes = [root];
  visibleGraph.edges = [];

  console.log("Visible nodes:", visibleGraph.nodes);
  console.log("Visible edges:", visibleGraph.edges);

  update();
});

/* ---------------- UPDATE ---------------- */

function update() {
  container.selectAll("*").remove();

  /* -------- LINKS -------- */
  const link = container.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(visibleGraph.edges, d => `${d.source.id}-${d.target.id}`)
    .join("line")
    .attr("class", "link")
    .attr("stroke", "#aaa")
    .attr("stroke-width", 1.5);

  /* -------- NODES -------- */
  const node = container.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(visibleGraph.nodes, d => d.id)
    .join("g")
    .attr("class", "node")
    .call(drag(simulation));

  /* -------- MAIN CIRCLE -------- */
  node.append("circle")
    // .attr("r", 48) // FIXED RADIUS
    // .attr("r", d => computeCircleRadius(d)) // DYANMIC RADIUS
    .attr("r", d => { // DYNAMIC RADIUS with caching
      d._radius = computeCircleRadius(d);
      return d._radius;
    })
    .on("click", expandNode)
    .attr("fill", d => {
      // Specific colors for extra fonds (look for parent in visible edges)
      const parentEdge = visibleGraph.edges.find(e => e.target.id === d.id);
      if (parentEdge) {
        const parentName = parentEdge.source.attributes.name;
        if (parentName === "Possible extra-archives") return "#56beb9";
        if (parentName === "Archives of Contextualization") return "#bc98df";
      }
      // Sinon couleur par label selon les constantes définies plus haut
      return colorScale(d.labels[0]);
    });

  /* -------- OUTER RING (EXPANDABLE NODES) -------- */
  node.filter(d => isExpandable(d) && !d._expanded)
    .append("circle")
    // .attr("r", 54)
    .attr("r", d => computeCircleRadius(d) + 6)
    .attr("fill", "none")
    .attr("stroke", "#555")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "4 4")
    .style("pointer-events", "none");

  /* -------- NODE NAME -------- */
  node.each(function(d) {
    const lines = wrapText(d);
    const cssClass = d.labels[0] ? d.labels[0].toLowerCase() : null;

    const textElem = d3.select(this).append("text")
      .attr("x", 0)
      .attr("y", - (lines.length - 1) * 7) // centrer verticalement
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("pointer-events", "none")
      .attr("class", cssClass);

    lines.forEach((line, i) => {
      textElem.append("tspan")
        .text(line)
        .attr("x", 0)
        .attr("dy", i === 0 ? 0 : 14); // espacement entre lignes
    });
  });

  /* -------- URL ICON -------- */
  node.filter(d => d.attributes.url)  // uniquement pour les nœuds avec URL
    .append("text")
    .text("🔗")
    .attr("x", d => d._radius - 13)
    .attr("y", d => d._radius - 13)
    // .attr("x", 40)
    // .attr("y", 35)
    .attr("text-anchor", "start") // start at the defined x position
    .attr("dominant-baseline", "middle")
    .style("cursor", "pointer")
    .style("pointer-events", "all")
    .on("click", (event, d) => {
      event.stopPropagation(); // avoid triggering expandNode
      window.open(d.attributes.url, "_blank");
    });

  /* -------- SIMULATION -------- */
  simulation.nodes(visibleGraph.nodes).on("tick", ticked);
  simulation.force("link").links(visibleGraph.edges);
  simulation.alpha(0.6).restart();

  function ticked() {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("transform", d => `translate(${d.x},${d.y})`);
  }
}

/* ---------------- DRAG ---------------- */

function drag(sim) {
  function dragstarted(event, d) {
    event.sourceEvent.stopPropagation();
    if (!event.active) sim.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) sim.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  return d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

/* ---------------- EXPAND NODE ---------------- */

function expandNode(event, node) {
  event.stopPropagation();
  node._expanded = true; // mark node as expanded

  // 🔒 Lock clicked node in place
  node.fx = node.x;
  node.fy = node.y;

  // Find outgoing edges from this node
  const newEdges = fullGraph.edges.filter(
    e => e.source === node.id
  );

  newEdges.forEach(edge => {
    const targetNode = fullGraph.nodes.find(n => n.id === edge.target);

    if (!visibleGraph.nodes.find(n => n.id === targetNode.id)) {
      // Start new nodes near the clicked node
      targetNode.x = node.x + (Math.random() - 0.5) * 100;
      targetNode.y = node.y + (Math.random() - 0.5) * 100;
      visibleGraph.nodes.push(targetNode);
    }

    if (!visibleGraph.edges.find(
      e =>
        e.source.id === node.id &&
        e.target.id === targetNode.id
    )) {
      visibleGraph.edges.push({
        source: node,
        target: targetNode,
        label: edge.label
      });
    }
  });

  update();

  // Release node after layout stabilizes
  setTimeout(() => {
    node.fx = null;
    node.fy = null;
  }, 300);
}

/* ---------------- LEGEND ---------------- */

svg.append("defs")
  .append("linearGradient")
  .attr("id", "himo-gradient")
  .attr("x1", "0%")
  .attr("y1", "0%")
  .attr("x2", "100%")
  .attr("y2", "0%")
  .selectAll("stop")
  .data([
    { offset: "0%", color: "#88bfe7" },
    { offset: "70%", color: "#c2def2" },
    { offset: "100%", color: "#ebebf8" }
  ])
  .enter()
  .append("stop")
  .attr("offset", d => d.offset)
  .attr("stop-color", d => d.color);

const legendData = [
  { label: "Archives in HIMO fonds", color: "url(#himo-gradient)", type: "circle"},
  { label: "Possible extra-archives", color: "#56beb9", type: "circle"},
  { label: "Archives of Contextualization", color: "#bc98df", type: "circle"},
  { label: "Expandable node", type: "dashed"},
  { label: "External links", type: "icon"},
];

// Legend spacing settings
const topPadding = 20;
const itemHeight = 20;
const groupGap = 12;

// Legend group
const legend = svg.append("g")
  .attr("class", "legend")
  .attr("transform", `translate(${width - 260}, 30)`);

// Background box (fixed compact height)
legend.append("rect")
  .attr("width", 240)
  .attr("height", topPadding + legendData.length * itemHeight + groupGap)
  .attr("rx", 8)
  .attr("ry", 8)
  .attr("fill", "white")
  .attr("stroke", "#ccc")
  .attr("opacity", 0.95);

// Legend items
const legendItem = legend.selectAll(".legend-item")
  .data(legendData)
  .enter()
  .append("g")
  .attr("class", "legend-item")
  .attr("transform", (d, i) => {
    // Add extra gap after the first 3 circle items
    const extraSpacing = i > 2 ? groupGap : 0;
    return `translate(20, ${topPadding + i * itemHeight + extraSpacing})`;
  });

// Colored circles
legendItem
  .filter(d => d.type === "circle")
  .append("circle")
  .attr("r", 7)
  .attr("fill", d => d.color);

// Dashed expandable ring
legendItem
  .filter(d => d.type === "dashed")
  .append("circle")
  .attr("r", 7)
  .attr("fill", "none")
  .attr("stroke", "#555")
  .attr("stroke-width", 1.5)
  .attr("stroke-dasharray", "4 4");

// External link icon
legendItem
  .filter(d => d.type === "icon")
  .append("text")
  .text("🔗")
  .attr("x", -6)
  .attr("y", 5)
  .style("font-size", "14px");

// Labels
legendItem.append("text")
  .attr("x", 20)
  .attr("y", 5)
  .text(d => d.label)
  .style("font-size", "12px")
  .style("fill", "#333");

// Add graph title
svg.append("text")
  .attr("x", 30)              // 20px from the left edge
  .attr("y", 50)              // 40px from the top edge
  .text("HIMO Archives Cartography")
  .style("font-size", "26px")
  .style("font-weight", "bold")
  .style("fill", "#333")
  .style("pointer-events", "none"); // ensures it doesn't block panning/zooming