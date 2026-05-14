const RAW_URL_PATTERN =
  /https?:\/\/[^\s<>()\]]+[^\s<>().,\];:"'!?]|www\.[^\s<>()\]]+[^\s<>().,\];:"'!?]|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\/[^\s<>()\]]*[^\s<>().,\];:"'!?]/gi;

function normalizeUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(value);
}

function getUrl(value) {
  try {
    return new URL(normalizeUrl(value));
  } catch {
    return null;
  }
}

function getDomain(value) {
  const url = getUrl(value);
  return url ? url.hostname.replace(/^www\./i, "") : value;
}

function getFaviconUrl(value) {
  const url = getUrl(value);
  if (!url) {
    return "";
  }

  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url.origin)}`;
}

function makeFaviconNode(url) {
  return {
    type: "image",
    url: getFaviconUrl(url),
    alt: "",
    data: {
      hProperties: {
        className: ["link-chip__favicon"],
        loading: "lazy",
        decoding: "async",
        referrerPolicy: "no-referrer",
        onerror: "this.style.display='none'"
      }
    }
  };
}

function decorateExternalLink(node, { raw = false } = {}) {
  if (!isExternalUrl(node.url)) {
    return;
  }

  node.data = node.data || {};
  node.data.linkChipDecorated = true;
  node.data.hProperties = {
    ...node.data.hProperties,
    className: ["link-chip"],
    target: "_blank",
    rel: "noopener noreferrer",
    title: node.url,
    "data-domain": getDomain(node.url)
  };

  const children = raw
    ? [{ type: "text", value: getDomain(node.url) }]
    : node.children.filter((child) => child.data?.hProperties?.className?.includes("link-chip__favicon") !== true);

  node.children = [makeFaviconNode(node.url), ...children];
}

function linkifyTextNode(node) {
  const value = node.value;
  const children = [];
  let lastIndex = 0;
  let match;

  RAW_URL_PATTERN.lastIndex = 0;
  while ((match = RAW_URL_PATTERN.exec(value))) {
    const url = match[0];
    if (match.index > lastIndex) {
      children.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    const link = {
      type: "link",
      url: normalizeUrl(url),
      title: null,
      children: [{ type: "text", value: getDomain(url) }]
    };
    decorateExternalLink(link, { raw: true });
    children.push(link);
    lastIndex = match.index + url.length;
  }

  if (lastIndex === 0) {
    return null;
  }

  if (lastIndex < value.length) {
    children.push({ type: "text", value: value.slice(lastIndex) });
  }

  return children;
}

function visit(node, parent = null, index = null) {
  if (!node) {
    return;
  }

  if (node.type === "link") {
    const raw =
      node.children.length === 1 &&
      node.children[0].type === "text" &&
      node.children[0].value === node.url;
    decorateExternalLink(node, { raw });
    return;
  }

  if (node.type === "text" && parent && Array.isArray(parent.children)) {
    const linkedChildren = linkifyTextNode(node);
    if (linkedChildren) {
      parent.children.splice(index, 1, ...linkedChildren);
      return;
    }
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
    visit(node.children[childIndex], node, childIndex);
  }
}

export default function remarkLinkChips() {
  return (tree) => {
    visit(tree);
  };
}
