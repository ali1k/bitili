(function () {
  'use strict';

  var FEED_URL = 'https://platform.bitili.com/api/v1/news-intelligence/rss.xml?period=7&minRelevance=50';
  var SNAPSHOT_URL = 'data/news.json';
  var MAX_ITEMS = 15;

  // Broad labels that do not help readers scan the list.
  var HIDDEN_TAGS = { ai: true, news: true };

  var list = document.getElementById('news-list');
  var status = document.getElementById('news-status');
  if (!list) return;

  var dateFormatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  function plainText(value) {
    var holder = document.createElement('div');
    holder.innerHTML = value || '';
    return (holder.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
      return '';
    }
  }

  function topicsFor(categories) {
    return (categories || [])
      .map(function (category) {
        return (category || '').trim();
      })
      .filter(function (category) {
        if (!category || category.length > 32) return false;
        // Skip taxonomy codes such as SCIENTIFIC_DISCOVERY or EVENT.
        if (/^[A-Z0-9_\s-]+$/.test(category)) return false;
        return !HIDDEN_TAGS[category.toLowerCase()];
      })
      .slice(0, 3);
  }

  function normalize(item) {
    return {
      title: (item.title || '').trim(),
      link: (item.link || '').trim(),
      description: plainText(item.description),
      pubDate: (item.pubDate || '').trim(),
      categories: item.categories || []
    };
  }

  function fromSnapshot(payload) {
    var items = Array.isArray(payload) ? payload : (payload && payload.items) || [];
    return items.map(normalize);
  }

  function fromXml(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('Malformed feed');
    }
    return Array.prototype.map.call(doc.getElementsByTagName('item'), function (item) {
      return normalize({
        title: item.getElementsByTagName('title')[0] && item.getElementsByTagName('title')[0].textContent,
        link: item.getElementsByTagName('link')[0] && item.getElementsByTagName('link')[0].textContent,
        description: item.getElementsByTagName('description')[0] && item.getElementsByTagName('description')[0].textContent,
        pubDate: item.getElementsByTagName('pubDate')[0] && item.getElementsByTagName('pubDate')[0].textContent,
        categories: Array.prototype.map.call(item.getElementsByTagName('category'), function (category) {
          return category.textContent;
        })
      });
    });
  }

  function fetchText(url, headers) {
    return fetch(url, {
      headers: headers || {},
      credentials: 'omit',
      cache: 'no-cache'
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    });
  }

  function buildItem(item) {
    var li = document.createElement('li');
    li.className = 'news-item';

    var link = document.createElement('a');
    link.className = 'news-link';
    link.href = item.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    var meta = document.createElement('div');
    meta.className = 'news-meta';

    var time = document.createElement('time');
    var published = item.pubDate ? new Date(item.pubDate) : null;
    if (published && !isNaN(published.getTime())) {
      time.dateTime = published.toISOString();
      time.textContent = dateFormatter.format(published);
    } else {
      time.textContent = 'Recent';
    }
    meta.appendChild(time);

    var source = document.createElement('span');
    source.className = 'news-source';
    source.textContent = hostOf(item.link);
    source.title = source.textContent;
    meta.appendChild(source);

    var body = document.createElement('div');
    body.className = 'news-body';

    var title = document.createElement('h3');
    title.className = 'news-title';
    title.textContent = item.title;
    body.appendChild(title);

    if (item.description) {
      var description = document.createElement('p');
      description.className = 'news-desc';
      description.textContent = item.description;
      body.appendChild(description);
    }

    var topics = topicsFor(item.categories);
    if (topics.length) {
      var tags = document.createElement('div');
      tags.className = 'news-tags';
      topics.forEach(function (topic) {
        var tag = document.createElement('span');
        tag.className = 'news-tag';
        tag.textContent = topic;
        tags.appendChild(tag);
      });
      body.appendChild(tags);
    }

    var arrow = document.createElement('span');
    arrow.className = 'news-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg>';

    link.appendChild(meta);
    link.appendChild(body);
    link.appendChild(arrow);
    li.appendChild(link);

    return li;
  }

  function render(items) {
    var stories = items
      .filter(function (item) {
        return item.title && item.link;
      })
      .slice(0, MAX_ITEMS);

    if (!stories.length) throw new Error('No stories');

    list.innerHTML = '';
    stories.forEach(function (story) {
      list.appendChild(buildItem(story));
    });

    list.setAttribute('aria-busy', 'false');
    if (status) status.hidden = true;
  }

  function showError() {
    list.innerHTML = '';
    list.setAttribute('aria-busy', 'false');
    if (!status) return;
    status.hidden = false;
    status.textContent = 'The live news feed could not be loaded right now. ';
    var link = document.createElement('a');
    link.href = FEED_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Read the latest stories directly';
    status.appendChild(link);
    status.appendChild(document.createTextNode('.'));
  }

  // Prefer the build-time snapshot (same origin, fast). Fall back to the live
  // RSS feed, then to a readable proxy when the platform does not send CORS
  // headers for this origin.
  var sources = [
    function () {
      var url = SNAPSHOT_URL + '?v=' + Math.floor(Date.now() / 3600000);
      return fetchText(url).then(function (text) {
        return fromSnapshot(JSON.parse(text));
      });
    },
    function () {
      return fetchText(FEED_URL, { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' }).then(fromXml);
    },
    function () {
      return fetchText('https://r.jina.ai/' + FEED_URL, {
        Accept: 'application/xml',
        'X-Return-Format': 'html'
      }).then(fromXml);
    }
  ];

  function next(index) {
    if (index >= sources.length) {
      showError();
      return;
    }
    sources[index]()
      .then(render)
      .catch(function () {
        next(index + 1);
      });
  }

  next(0);
})();
