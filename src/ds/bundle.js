/* Copia del bundle del design system jpdazab (https://claude.ai/artifact/67ierA58ddzJjMydKg2AQm).
   Único cambio: la ruta del logo JD_BARE apunta a src/ds/logos. */
/* @ds-bundle: {"format":4,"namespace":"Jpdazab","components":[{"name":"Icon"},{"name":"Button"},{"name":"NavBar"},{"name":"BentoCard"},{"name":"HeroCard"},{"name":"TestimonialCard"},{"name":"ReviewCard"},{"name":"SectionHeader"},{"name":"LinkList"},{"name":"CaseStudyCard"},{"name":"Statement"},{"name":"NumberedCard"},{"name":"Tag"},{"name":"CarouselCard"},{"name":"CarouselVenn"},{"name":"JDMark"},{"name":"CoverCard"},{"name":"SlideCard"},{"name":"StatCard"},{"name":"StatGrid"},{"name":"ComparisonBars"},{"name":"ProgressBars"},{"name":"CarouselImage"},{"name":"Carousel"}]} */
(function () {
  var React = window.React, h = React.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  /* ---------- Icon: the juandaza.design outline set (24px grid, 1.5 stroke, round caps) ---------- */
  var ICONS = {
    'arrow-up-right': [["M 8.5 8.5 L 8.5 0 L 0 0", "8.75 6.75"], ["M 10.25 0 L 0 10.25", "6.75 7"]],
    'arrow-right': [["M 0 0 L 5.5 5.25 L 0 10.5", "13.75 6.75"], ["M 14.25 0 L 0 0", "4.75 12"]],
    'mail': [["M 0 2 C 0 0.895 0.895 0 2 0 L 12.5 0 C 13.605 0 14.5 0.895 14.5 2 L 14.5 10.5 C 14.5 11.605 13.605 12.5 12.5 12.5 L 2 12.5 C 0.895 12.5 0 11.605 0 10.5 Z", "4.75 5.75"], ["M 0 0 L 6.5 5.75 L 13 0", "5.5 6.5"]],
    'globe': [["M 0 7.25 C 0 3.246 3.246 0 7.25 0 C 11.254 0 14.5 3.246 14.5 7.25 C 14.5 11.254 11.254 14.5 7.25 14.5 C 3.246 14.5 0 11.254 0 7.25 Z", "4.75 4.75"], ["M 6.5 7.25 C 6.5 11.75 4.493 14.5 3.25 14.5 C 2.007 14.5 0 11.75 0 7.25 C 0 2.75 2.007 0 3.25 0 C 4.493 0 6.5 2.75 6.5 7.25 Z", "8.75 4.75"], ["M 0 0 L 7 0 L 14 0", "5 12"]],
    'music': [["M 0 2.25 C 0 1.007 1.007 0 2.25 0 C 3.493 0 4.5 1.007 4.5 2.25 C 4.5 3.493 3.493 4.5 2.25 4.5 C 1.007 4.5 0 3.493 0 2.25 Z", "4.75 14.75"], ["M 0 12.25 L 0 2 C 0 0.895 0.895 0 2 0 L 8 0 C 9.105 0 10 0.895 10 2 L 10 9.25", "9.25 4.75"], ["M 0 2.25 C 0 1.007 1.007 0 2.25 0 C 3.493 0 4.5 1.007 4.5 2.25 C 4.5 3.493 3.493 4.5 2.25 4.5 C 1.007 4.5 0 3.493 0 2.25 Z", "14.75 11.75"]],
    'map': [["M 0 2 L 4.5 0 L 4.5 12.5 L 0 14.5 Z", "4.75 4.75"], ["M 0 2 L 4.5 0 L 4.5 12.5 L 0 14.5 Z", "14.75 4.75"], ["M 5.5 2 L 0 0 L 0 12.5 L 5.5 14.5 Z", "9.25 4.75"]]
  };
  function Icon(props) {
    var paths = ICONS[props.name] || [];
    var size = props.size || 20;
    return h('svg', { className: cx('jd-icon', props.className), width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      'aria-hidden': props.label ? null : 'true', role: props.label ? 'img' : null, 'aria-label': props.label || null },
      paths.map(function (p, i) {
        return h('path', { key: i, d: p[0], transform: 'translate(' + p[1] + ')', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' });
      }));
  }

  /* ---------- Button: the pill ---------- */
  function Button(props) {
    var variant = props.variant || 'primary', size = props.size || 'md';
    var tag = props.href ? 'a' : 'button';
    var attrs = { className: cx('jd-btn', 'jd-btn--' + variant, 'jd-btn--' + size, props.className), onClick: props.onClick };
    if (props.href) { attrs.href = props.href; if (props.external) { attrs.target = '_blank'; attrs.rel = 'noopener'; } }
    else { attrs.type = props.type || 'button'; attrs.disabled = props.disabled; }
    return h(tag, attrs,
      props.icon ? h(Icon, { name: props.icon, size: 20 }) : null,
      h('span', { className: 'jd-btn__label' }, props.children));
  }

  /* ---------- NavBar: glass pill with logo, links and one CTA ---------- */
  function NavBar(props) {
    var links = props.links || [];
    return h('nav', { className: cx('jd-nav', props.className), 'aria-label': props.label || 'Main' },
      h('a', { className: 'jd-nav__logo', href: props.logoHref || '/' },
        props.logoSrc ? h('img', { src: props.logoSrc, alt: props.logoAlt || 'Juan Daza', height: 50 }) : h('span', { className: 'jd-nav__mono' }, 'JD')),
      h('div', { className: 'jd-nav__right' },
        h('ul', { className: 'jd-nav__links' }, links.map(function (l, i) {
          return h('li', { key: i }, h('a', { href: l.href, target: l.external ? '_blank' : null, rel: l.external ? 'noopener' : null },
            l.label, l.external ? h(Icon, { name: 'arrow-up-right', size: 14 }) : null));
        })),
        props.cta ? h(Button, { variant: 'primary', size: 'md', icon: props.cta.icon || 'mail', href: props.cta.href }, props.cta.label) : null));
  }

  /* ---------- BentoCard: the tiles of the home grid ---------- */
  function BentoCard(props) {
    var tone = props.tone || 'tile';
    var tag = props.href ? 'a' : 'div';
    return h(tag, { className: cx('jd-bento', 'jd-bento--' + tone, props.className), href: props.href || null,
      style: props.height ? { minHeight: props.height } : null },
      (props.icon || props.href) ? h('div', { className: 'jd-bento__top' },
        props.icon ? h(Icon, { name: props.icon, size: 20 }) : h('span'),
        props.href ? h(Icon, { name: 'arrow-up-right', size: 20, className: 'jd-bento__arrow' }) : null) : null,
      props.children ? h('div', { className: 'jd-bento__body' }, props.children) : null,
      (props.title || props.subtitle) ? h('p', { className: 'jd-bento__title' },
        props.title ? h('span', null, props.title) : null,
        props.subtitle ? h('span', { className: 'jd-bento__sub' }, props.subtitle) : null) : null);
  }

  /* ---------- HeroCard: the violet welcome card ---------- */
  function HeroCard(props) {
    return h('section', { className: cx('jd-hero', props.className) },
      props.eyebrow ? h('p', { className: 'jd-hero__eyebrow' }, props.eyebrow) : null,
      h('p', { className: 'jd-hero__lead' }, props.children),
      props.action ? h('div', { className: 'jd-hero__action' },
        h(Button, { variant: 'inverse', size: 'lg', icon: props.action.icon || 'arrow-right', href: props.action.href }, props.action.label)) : null);
  }
  /* Emphasis inside HeroCard / TestimonialCard: the bright words; everything else reads muted. */
  function Em(props) { return h('strong', { className: 'jd-em' }, props.children); }

  /* ---------- TestimonialCard ---------- */
  function TestimonialCard(props) {
    return h('figure', { className: cx('jd-quote', props.className) },
      h('blockquote', { className: 'jd-quote__text' }, props.children),
      h('figcaption', { className: 'jd-quote__author' },
        props.avatarSrc ? h('img', { className: 'jd-quote__avatar', src: props.avatarSrc, alt: '' }) : h('span', { className: 'jd-quote__avatar', 'aria-hidden': 'true' }),
        h('span', null, h('span', { className: 'jd-quote__name' }, props.name), h('span', { className: 'jd-quote__role' }, props.role))),
      props.action ? h('div', { className: 'jd-quote__action' },
        h(Button, { variant: 'primary', size: 'lg', icon: 'arrow-right', href: props.action.href }, props.action.label)) : null);
  }

  /* ---------- ReviewCard ---------- */
  function ReviewCard(props) {
    return h('article', { className: cx('jd-review', props.className) },
      h('p', { className: 'jd-review__label' }, props.label || 'Product review'),
      h('p', { className: 'jd-review__text' }, props.children),
      h('div', { className: 'jd-review__foot' },
        props.href ? h(Button, { variant: 'primary', size: 'md', icon: 'arrow-up-right', href: props.href, external: true }, props.actionLabel || 'View full review') : h('span'),
        props.source ? h('div', { className: 'jd-review__source' }, props.source) : null));
  }

  /* ---------- SectionHeader ---------- */
  function SectionHeader(props) {
    var H = 'h' + (props.level || 2);
    return h('header', { className: cx('jd-section-head', props.align === 'center' && 'jd-section-head--center', props.className) },
      h(H, { className: 'jd-section-head__title' }, props.title),
      props.subtitle ? h('p', { className: 'jd-section-head__sub' }, props.subtitle) : null);
  }

  /* ---------- LinkList: article rows with an arrow and a hairline ---------- */
  function LinkList(props) {
    var items = props.items || [];
    return h('ul', { className: cx('jd-links', props.className) }, items.map(function (it, i) {
      return h('li', { key: i }, h('a', { className: 'jd-links__row', href: it.href, target: it.external === false ? null : '_blank', rel: 'noopener' },
        h('span', { className: 'jd-links__title' }, it.title),
        h(Icon, { name: 'arrow-up-right', size: 20 })));
    }));
  }

  /* ---------- CaseStudyCard ---------- */
  function CaseStudyCard(props) {
    var tag = props.href ? 'a' : 'div';
    return h(tag, { className: cx('jd-case', props.className), href: props.href || null },
      h('div', { className: 'jd-case__media' },
        props.imageSrc ? h('img', { src: props.imageSrc, alt: props.imageAlt || '' }) : props.children),
      h('h3', { className: 'jd-case__title' }, props.title));
  }

  /* ---------- Statement: the scroll-reveal line ---------- */
  function Statement(props) {
    var words = String(props.text || '').split(' ');
    var p = props.progress == null ? 1 : Math.max(0, Math.min(1, props.progress));
    var lit = Math.round(words.length * p);
    return h('p', { className: cx('jd-statement', props.className), 'aria-label': props.text },
      words.map(function (w, i) {
        return h('span', { key: i, 'aria-hidden': 'true', className: i < lit ? 'is-lit' : null }, w + (i < words.length - 1 ? ' ' : ''));
      }));
  }

  /* ---------- NumberedCard (social post, unchanged) ---------- */
  function NumberedCard(props) {
    var number = props.number, title = props.title, description = props.description;
    var cls = 'jd-ncard' + (props.className ? ' ' + props.className : '');
    return h('div', { className: cls, role: 'group', 'aria-label': (number != null ? number + '. ' : '') + (title || '') },
      h('div', { className: 'jd-ncard__num', 'aria-hidden': 'true' }, number),
      h('div', { className: 'jd-ncard__body' },
        title ? h('h3', { className: 'jd-ncard__title' }, title) : null,
        description ? h('p', { className: 'jd-ncard__desc' }, description) : null,
        props.children || null));
  }
  function NumberedCardList(props) {
    var items = props.items || [];
    return h('div', { className: 'jd-ncard-list' }, items.map(function (it, i) {
      return h(NumberedCard, { key: i, number: it.number != null ? it.number : i + 1, title: it.title, description: it.description });
    }));
  }

  /* ---------- Tag: the yellow pill from template-post.pdf ---------- */
  function Tag(props) {
    var size = props.size || 'md', tone = props.tone || 'highlight';
    return h('span', { className: cx('jd-tag', 'jd-tag--' + size, tone !== 'highlight' && 'jd-tag--' + tone, props.className) }, props.children);
  }

  /* ---------- CarouselCard: the social carousel template (template-post.pdf, 1231 x 1731) ---------- */
  var JD_BARE = new URL('./logos/jd-monogram-bare.svg', import.meta.url).href; // Posty: logo local en vez del asset del artifact
  function CarouselCard(props) {
    var swipe = props.swipe === undefined ? 'Swipe' : props.swipe;
    var meta = props.meta;
    return h('article', { className: cx('jd-carousel', props.className), 'aria-label': props.label || null },
      h('div', { className: 'jd-carousel__card' },
        (props.tag || meta) ? h('div', { className: 'jd-carousel__head' },
          props.tag ? h(Tag, { size: 'lg' }, props.tag) : h('span'),
          meta ? h('p', { className: 'jd-carousel__meta' }, Array.isArray(meta) ? meta.map(function (m, i) {
            return h('span', { key: i, className: 'jd-carousel__meta-line' }, m);
          }) : meta) : null) : null,
        h('h2', { className: 'jd-carousel__title' },
          props.title ? h('span', { className: 'jd-carousel__title-line' }, props.title) : null,
          props.titleAccent ? h('span', { className: 'jd-carousel__title-line jd-carousel__title-accent' }, props.titleAccent) : null),
        props.summary ? h('p', { className: 'jd-carousel__summary' }, props.summary) : null,
        h('div', { className: 'jd-carousel__visual' }, props.children)),
      h('footer', { className: 'jd-carousel__foot' },
        h('div', { className: 'jd-carousel__sign' },
          h('img', { className: 'jd-carousel__logo', src: props.logoSrc || JD_BARE, alt: 'JD' }),
          h('span', { className: 'jd-carousel__handle' }, props.handle || '@jpdazab')),
        swipe ? h('span', { className: 'jd-carousel__swipe' }, swipe, h(Icon, { name: 'arrow-right', size: 40 })) : null));
  }

  /* A two-set Venn for the carousel visual slot. tone brand = white sets + brand-fill overlap (template-post);
     tone highlight = white sets + pale-yellow overlap with an electric-blue label (Template-4). */
  function CarouselVenn(props) {
    var d = props.diameter || 634, r = d / 2, cx1 = r, cx2 = r * 2, cy = r, W = r * 3, H = d;
    var dx = (cx2 - cx1) / 2, yh = Math.sqrt(r * r - dx * dx);
    var lens = 'M ' + (cx1 + dx) + ' ' + (cy - yh) + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx1 + dx) + ' ' + (cy + yh) +
      ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx1 + dx) + ' ' + (cy - yh) + ' Z';
    var tone = props.tone || 'brand';
    return h('div', { className: cx('jd-venn', 'jd-venn--' + tone), style: { width: W + 'px', height: H + 'px' }, role: 'img',
      'aria-label': [props.left, props.overlap, props.right].filter(Boolean).join(', ') },
      h('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true' },
        h('circle', { cx: cx1, cy: cy, r: r, className: 'jd-venn__set' }),
        h('circle', { cx: cx2, cy: cy, r: r, className: 'jd-venn__set' }),
        h('path', { d: lens, className: 'jd-venn__overlap' })),
      h('span', { className: 'jd-venn__label', style: { left: (r * 0.4) + 'px' }, 'aria-hidden': 'true' }, props.left),
      h('span', { className: 'jd-venn__label jd-venn__label--mid', style: { left: (W / 2) + 'px' }, 'aria-hidden': 'true' }, props.overlap),
      h('span', { className: 'jd-venn__label', style: { left: (W - r * 0.4) + 'px' }, 'aria-hidden': 'true' }, props.right));
  }

  /* ================= Carousel covers & slides (Cover_*.pdf, Template-1..7.pdf, 1231 x 1731) ================= */

  /* JD mark traced from the carousel PDFs, drawn in currentColor so it follows the card's ink. */
  var JD_PATH = 'M24.09 38.22L20.99 38.22C17.95 38.29 14.92 37.91 11.99 37.1C9.78 36.51 7.7 35.52 5.85 34.17C4.4 33.01 3.18 31.6 2.25 30C1.43 28.62 0.82 27.12 0.45 25.55C0.15 24.15 0 22.72 0 21.28L0 21L14.35 21C14.75 25.28 17.56 27.47 22.63 27.47L23.02 27.47C24.19 27.57 25.36 27.42 26.46 27.02C27.56 26.62 28.56 25.99 29.38 25.16C30.82 23.43 31.54 21.22 31.41 18.97L31.41 0L45.76 0L45.76 22.85C45.6 24.08 45.32 25.28 44.92 26.46C44.55 27.71 44.04 28.92 43.4 30.06C42.68 31.25 41.79 32.33 40.75 33.27C39.58 34.3 38.28 35.17 36.87 35.85C35.08 36.68 33.18 37.27 31.24 37.6C28.89 38.06 26.49 38.27 24.09 38.22Z' +
    'M59.95 38.17L59.95 0.52L109.2 0.52C112.98 0.47 116.75 0.81 120.46 1.53C123.19 2.03 125.82 2.94 128.28 4.23C130.19 5.21 131.86 6.59 133.18 8.28C134.36 9.69 135.26 11.32 135.82 13.07C136.29 14.79 136.52 16.57 136.5 18.36L136.5 19.88C136.51 21.62 136.3 23.36 135.88 25.06C135.37 26.85 134.53 28.53 133.4 30.01C132.09 31.71 130.47 33.14 128.62 34.23C126.17 35.58 123.53 36.55 120.8 37.1C117.09 37.86 113.32 38.22 109.54 38.17Z' +
    'M74.07 10.59L74.07 28.44L107.28 28.44C116.57 28.44 121.24 25.51 121.24 19.66L121.24 19.32C121.24 13.69 116.57 10.59 107.29 10.59Z';
  function JDMark(props) {
    var hgt = props.height || 38;
    return h('svg', { className: cx('jd-mark', props.className), viewBox: '0 0 136.52 38.29', height: hgt, width: Math.round(hgt * 136.52 / 38.29),
      role: 'img', 'aria-label': props.label || 'JD' },
      h('path', { d: JD_PATH, fill: 'currentColor', fillRule: 'evenodd' }));
  }

  function slideHead(props, tagTone) {
    var meta = props.meta;
    if (!props.tag && !meta) return null;
    return h('div', { className: 'jd-slide__head' },
      props.tag ? h(Tag, { size: 'lg', tone: tagTone }, props.tag) : h('span'),
      meta ? h('p', { className: 'jd-slide__meta' }, Array.isArray(meta) ? meta.map(function (m, i) {
        return h('span', { key: i, className: 'jd-slide__meta-line' }, m);
      }) : meta) : null);
  }
  function slideFoot(props) {
    var swipe = props.swipe === undefined ? 'Swipe' : props.swipe;
    return h('footer', { className: 'jd-slide__foot' },
      h('div', { className: 'jd-slide__sign' },
        h(JDMark, { height: 38 }),
        h('span', { className: 'jd-slide__handle' }, props.handle || '@jpdazab')),
      swipe ? h('span', { className: 'jd-slide__swipe' }, swipe, h(Icon, { name: 'arrow-right', size: 40 })) : null);
  }

  /* CoverCard: the first slide. tone grey = Cover_Main, ink = Cover_black, blue = Cover_black-1, yellow = Cover_yellow. */
  var COVER_TAG = { grey: 'ink', ink: 'soft', blue: 'soft', yellow: 'ink' };
  function CoverCard(props) {
    var tone = props.tone || 'grey';
    return h('article', { className: cx('jd-slide', 'jd-cover', 'jd-cover--' + tone, props.className), 'aria-label': props.label || null },
      h('div', { className: 'jd-slide__card' },
        slideHead(props, COVER_TAG[tone] || 'ink'),
        h('div', { className: 'jd-cover__body' },
          h('h2', { className: 'jd-cover__title' }, props.title),
          props.summary ? h('p', { className: 'jd-cover__summary' }, props.summary) : null),
        slideFoot(props)));
  }

  /* SlideCard: an inner slide. Grey card with head, two-colour title, summary and one visual; footer on white below. */
  function SlideCard(props) {
    return h('article', { className: cx('jd-slide', 'jd-slide--inner', props.className), 'aria-label': props.label || null },
      h('div', { className: 'jd-slide__card' },
        slideHead(props, 'ink'),
        h('h2', { className: 'jd-slide__title' },
          props.title ? h('span', { className: 'jd-slide__title-line' }, props.title) : null,
          props.titleAccent ? h('span', { className: 'jd-slide__title-line jd-slide__title-accent' }, props.titleAccent) : null),
        props.summary ? h('p', { className: 'jd-slide__summary' }, props.summary) : null,
        h('div', { className: 'jd-slide__visual' }, props.children)),
      slideFoot(props));
  }

  /* StatCard: one number tile (Template-1/2). tone white | ink | blue | yellow. grow = relative width in a StatGrid row. */
  function StatCard(props) {
    var tone = props.tone || 'white';
    return h('div', { className: cx('jd-stat', 'jd-stat--' + tone, props.className), style: { flexGrow: props.grow || 1 } },
      h('span', { className: 'jd-stat__value' }, props.value),
      props.label ? h('span', { className: 'jd-stat__label' }, props.label) : null);
  }
  /* StatGrid: rows of StatCards, 24px gaps, 991px wide. rows = [[stat], [stat, stat], …]. */
  function StatGrid(props) {
    return h('div', { className: cx('jd-statgrid', props.className) },
      (props.rows || []).map(function (row, i) {
        return h('div', { key: i, className: 'jd-statgrid__row' }, row.map(function (s, j) {
          return h(StatCard, { key: j, value: s.value, label: s.label, tone: s.tone, grow: s.grow });
        }));
      }));
  }

  function pct(v, max) { return Math.max(0, Math.min(100, (Number(v) || 0) / (max || 1) * 100)) + '%'; }
  /* ComparisonBars: per row a label and two bars (Template-3): a = electric blue, b = white; numbers follow each bar. */
  function ComparisonBars(props) {
    var items = props.items || [];
    var max = props.max || items.reduce(function (m, it) { return Math.max(m, Number(it.a) || 0, Number(it.b) || 0); }, 0);
    return h('div', { className: cx('jd-bars', 'jd-bars--compare', props.className) }, items.map(function (it, i) {
      return h('div', { key: i, className: 'jd-bars__row' },
        h('span', { className: 'jd-bars__label' }, it.label),
        h('div', { className: 'jd-bars__pair' },
          h('div', { className: 'jd-bars__line' },
            h('span', { className: 'jd-bars__bar jd-bars__bar--a', style: { width: pct(it.a, max) } }),
            h('span', { className: 'jd-bars__value' }, it.aLabel != null ? it.aLabel : it.a)),
          h('div', { className: 'jd-bars__line' },
            h('span', { className: 'jd-bars__bar jd-bars__bar--b', style: { width: pct(it.b, max) } }),
            h('span', { className: 'jd-bars__value' }, it.bLabel != null ? it.bLabel : it.b))));
    }));
  }
  /* ProgressBars: label, white track, fill and value (Template-6 brand-fill, Template-7 highlight). */
  function ProgressBars(props) {
    var items = props.items || [], max = props.max || 100, tone = props.tone || 'brand';
    return h('div', { className: cx('jd-bars', 'jd-bars--progress', 'jd-bars--' + tone, props.className) }, items.map(function (it, i) {
      return h('div', { key: i, className: 'jd-bars__row' },
        h('span', { className: 'jd-bars__label' }, it.label),
        h('span', { className: 'jd-bars__track' }, h('span', { className: 'jd-bars__fill', style: { width: pct(it.value, max) } })),
        h('span', { className: 'jd-bars__value' }, it.display != null ? it.display : it.value));
    }));
  }

  /* CarouselImage: the image slot (Template-5), 991 x 637, grey placeholder when empty. */
  function CarouselImage(props) {
    return h('div', { className: cx('jd-slideimg', props.className), style: props.height ? { height: props.height + 'px' } : null },
      props.src ? h('img', { src: props.src, alt: props.alt || '' }) : h('span', { className: 'jd-slideimg__ph' }, props.placeholder || 'Image'));
  }

  /* Carousel: shows any of the slide cards in a swipeable, snapping row. The last slide drops "Swipe" automatically. */
  function Carousel(props) {
    var scale = props.scale || 0.3, gap = props.gap == null ? 24 : props.gap;
    var kids = React.Children.toArray(props.children);
    var ref = React.useRef(null);
    var st = React.useState(0), idx = st[0], setIdx = st[1];
    var step = 1231 * scale + gap;
    function go(n) { var el = ref.current; if (!el) return; var i = Math.max(0, Math.min(kids.length - 1, n)); el.scrollTo({ left: i * step, behavior: 'smooth' }); }
    function onScroll() { var el = ref.current; if (el) setIdx(Math.round(el.scrollLeft / step)); }
    return h('section', { className: cx('jd-carousel-strip', props.className), 'aria-roledescription': 'carousel', 'aria-label': props.label || 'Carousel' },
      h('div', { className: 'jd-carousel-strip__track', ref: ref, onScroll: onScroll, style: { gap: gap + 'px' } },
        kids.map(function (k, i) {
          var last = i === kids.length - 1;
          var child = (last && k.props && k.props.swipe === undefined) ? React.cloneElement(k, { swipe: false }) : k;
          return h('div', { key: i, className: 'jd-carousel-strip__slide', role: 'group', 'aria-roledescription': 'slide',
            'aria-label': (i + 1) + ' / ' + kids.length, style: { width: 1231 * scale + 'px', height: 1731 * scale + 'px' } },
            h('div', { style: { transform: 'scale(' + scale + ')', transformOrigin: '0 0', width: '1231px', height: '1731px' } }, child));
        })),
      kids.length > 1 ? h('div', { className: 'jd-carousel-strip__nav' },
        h('button', { type: 'button', className: 'jd-carousel-strip__btn jd-carousel-strip__btn--prev', onClick: function () { go(idx - 1); }, disabled: idx <= 0, 'aria-label': 'Previous slide' }, h(Icon, { name: 'arrow-right', size: 20 })),
        h('span', { className: 'jd-carousel-strip__count' }, (idx + 1) + ' / ' + kids.length),
        h('button', { type: 'button', className: 'jd-carousel-strip__btn', onClick: function () { go(idx + 1); }, disabled: idx >= kids.length - 1, 'aria-label': 'Next slide' }, h(Icon, { name: 'arrow-right', size: 20 }))) : null);
  }

  window.Jpdazab = {
    Icon: Icon, Button: Button, NavBar: NavBar, BentoCard: BentoCard, HeroCard: HeroCard, Em: Em,
    TestimonialCard: TestimonialCard, ReviewCard: ReviewCard, SectionHeader: SectionHeader, LinkList: LinkList,
    CaseStudyCard: CaseStudyCard, Statement: Statement, NumberedCard: NumberedCard, NumberedCardList: NumberedCardList,
    Tag: Tag, CarouselCard: CarouselCard, CarouselVenn: CarouselVenn,
    JDMark: JDMark, CoverCard: CoverCard, SlideCard: SlideCard, StatCard: StatCard, StatGrid: StatGrid,
    ComparisonBars: ComparisonBars, ProgressBars: ProgressBars, CarouselImage: CarouselImage, Carousel: Carousel
  };
})();
