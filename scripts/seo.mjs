import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { coverAwareSizes } from './responsive-sizes.mjs';

const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const escapeXML = value => String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const cap = value => value[0].toUpperCase() + value.slice(1);
const concise = value => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= 160) return text;
  return text.slice(0, 157).replace(/\s+\S*$/, '').replace(/[,;:.]$/, '') + '…';
};

export async function optimizeStyles(root, css) {
  const fonts = JSON.parse(await readFile(path.join(root, 'src/content/optimized-fonts.json'), 'utf8'));
  for (const font of fonts) css = css.replaceAll(font.original, font.optimized);
  // The picture wrapper must not become a grid/flex item or change any image geometry.
  return css.replace(/\r\n/g, '\n') + '\npicture{display:contents}\n';
}

export async function enhanceSite({root, recipes, images, editorial, domain, brand}) {
  const out = path.join(root, 'dist');
  const gochujang = brand === 'Gochujang';
  const read = file => readFile(path.join(root, file), 'utf8');
  const optimized = JSON.parse(await read('src/content/optimized-images.json'));
  const fonts = JSON.parse(await read('src/content/optimized-fonts.json'));
  const atmospheres = JSON.parse(await read('src/content/editorial-images.json'));
  const editorialBySrc = new Map(Object.values(atmospheres).map(i=>[i.src,{...i,srcset:i.avifSrcset}]));
  const imageBySrc = new Map(Object.entries(images).map(([slug, image]) => [image.src, slug]));
  const lanes = {
    traditional: ['Traditional Korean Recipes', 'Explore traditional Korean recipes, including dolsot bibimbap, kimchi jjigae, and doenjang jjigae. Find ingredients and step-by-step methods.'],
    modern: ['Modern Korean & Gochujang Recipes', 'Explore modern Korean recipes, from buldak fire noodles and yangnyeom chicken to gochujang-glazed galbi. Find ingredients, methods, and cooking notes.'],
    fusion: ['Gochujang Fusion Recipes', 'Cook with gochujang beyond the classics: discover bolognese, birria tacos, shakshuka, miso black cod, and dark chocolate tart recipes.']
  };
  if (gochujang) {
    const template = await read('dist/recipes/index.html');
    for (const [lane, [title, description]] of Object.entries(lanes)) {
      const $ = load(template);
      $('[data-recipe]').each((_, el) => { if ($(el).attr('data-lane') !== lane) $(el).remove(); });
      const count = $('[data-recipe]').length;
      $('.collection-heading-photo').html('');
      $('.collection-header').addClass('is-lane');
      $('.collection-header h1').html(`${cap(lane)} <em>recipes.</em>`);
      $('.collection-header>p').last().text(description);
      const startingPoints = {
        traditional: ['Compare a composed rice bowl with a kimchi stew.', ['dolsot-bibimbap', 'kimchi-jjigae']],
        modern: ['Choose a noodle dish or a glazed short-rib centerpiece.', ['buldak-fire-noodles', 'gochujang-glazed-galbi-short-ribs']],
        fusion: ['Explore gochujang in a pasta sauce or a chocolate dessert.', ['gochujang-bolognese', 'gochujang-dark-chocolate-tart']],
      };
      const [startingNote, startingSlugs] = startingPoints[lane];
      const startingLinks = startingSlugs.map(slug => {
        const recipe = recipes.find(r => r.slug === slug && r.lane === lane);
        if (!recipe) throw new Error(`Missing contextual starting point: ${lane}/${slug}`);
        return `<a class="text-link" href="/recipes/${slug}/">${escapeXML(recipe.title)}</a>`;
      });
      $('.collection-header').after(`<aside class="wrap collection-all" aria-label="Choose a starting recipe"><p>${startingNote} Start with ${startingLinks.join(' or ')}.</p></aside>`);
      $('[data-filter]').each((_, el) => { if ($(el).attr('data-filter') !== 'all') $(el).remove(); });
      $('[data-filter="all"]').html(`This collection <span>${count}</span>`);
      $('[data-result-count]').text(`${count} recipes to explore`);
      $('noscript p').text(`All ${count} recipes are shown. Enable JavaScript to search this collection.`);
      $('.collection').append('<p class="collection-all"><a class="text-link" href="/recipes/">Explore all 14 recipes <span aria-hidden="true">↗</span></a></p>');
      $('link[rel="canonical"]').attr('href', `${domain}/collections/${lane}/`);
      $('title').text(`${title} | ${brand}`);
      $('meta[name="description"]').attr('content', description);
      const folder = path.join(out, 'collections', lane);
      await mkdir(folder, {recursive:true});
      await writeFile(path.join(folder, 'index.html'), $.html());
    }
  }

  const files = [];
  async function walk(dir) {
    for (const item of await readdir(dir, {withFileTypes:true})) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await walk(file);
      else if (item.name.endsWith('.html')) files.push(file);
    }
  }
  await walk(out);
  const sitemap = [];
  for (const file of files) {
    const $ = load(await readFile(file, 'utf8'));
    const canonical = $('link[rel="canonical"]').attr('href');
    const route = new URL(canonical).pathname;
    const recipe = recipes.find(r => route === `/recipes/${r.slug}/`);
    const notFound = route === '/404/';
    const isCollection = Boolean($('[data-collection]').length);
    let title = $('title').text();
    let description = $('meta[name="description"]').attr('content');
    if (route === '/') {
      title = gochujang ? 'Gochujang Recipes & Korean Cooking | The Seoul Table' : 'Korean BBQ Recipes, Banchan & Grilling | KBBQGuide';
      description = gochujang
        ? 'Explore 14 Korean and gochujang recipes: traditional classics, modern favorites, and inventive fusion dishes. Ingredients, methods, and cooking notes.'
        : 'Explore 80 Korean BBQ recipes for the whole table: galbi, grilled pork, seafood, banchan, sauces, and desserts. Plan your Korean barbecue meal at home.';
    } else if (route === '/recipes/') {
      title = gochujang ? 'Korean & Gochujang Recipes | The Seoul Table' : '80 Korean BBQ Recipes & Side Dishes | KBBQGuide';
      description = gochujang
        ? 'Browse all 14 Korean and gochujang recipes. Find traditional dishes, modern favorites, and fusion ideas, with ingredients and step-by-step instructions.'
        : 'Browse all 80 Korean BBQ recipes by dish, ingredient, or tradition. Find grilled meats, seafood, Korean side dishes, dipping sauces, and desserts.';
    } else if (gochujang && route === '/about/') {
      title = 'Our Approach to Korean Cooking | The Seoul Table';
    } else if (recipe) {
      const shortTitle = editorial[recipe.slug]?.shortTitle || recipe.title;
      title = `${shortTitle}${/\brecipe\b/i.test(shortTitle) ? '' : ' Recipe'} | ${brand}`;
      if (gochujang && recipe.slug === 'baechu-kimchi') title = 'Modern Baechu Kimchi with Gochujang Recipe | Gochujang';
      if (description.length < 95) description += ' Find the ingredients, step-by-step method, and cooking notes.';
    } else if (!gochujang && route.startsWith('/collections/')) {
      const categoryTitles = {
        'grilled-meat':'Korean BBQ Meat Recipes: Galbi, Pork & Chicken',
        seafood:'Korean BBQ Seafood Recipes', banchan:'Korean Banchan & Side Dish Recipes',
        fresh:'Korean Salads, Ssam & Fresh Side Dishes', sauces:'Korean BBQ Sauce & Dipping Sauce Recipes',
        desserts:'Korean Dessert & Sweet Drink Recipes'
      };
      const label = categoryTitles[route.split('/')[2]];
      if (label) title = `${label} | ${brand}`;
    }
    description = concise(description);
    $('title').text(title);
    const meta = (key, value, attr='name') => {
      let node = $(`meta[${attr}="${key}"]`);
      if (!node.length) { node=$('<meta>').attr(attr,key); $('head').append(node); }
      node.attr('content', value);
    };
    meta('description', description);
    meta('robots', notFound ? 'noindex, follow' : 'index, follow, max-image-preview:large');
    meta('og:title', title, 'property'); meta('og:description',description,'property');
    meta('og:url',canonical,'property'); meta('og:locale','en_US','property');
    meta('twitter:title',title); meta('twitter:description',description);
    const share = $('meta[property="og:image"]').attr('content');
    if (share) {
      const image = Object.values(images).find(i => `${domain}${i.jpg || i.src}` === share);
      meta('twitter:image', share);
      if (image) {
        meta('og:image:alt',image.alt,'property'); meta('twitter:image:alt',image.alt);
        // Keep the existing social JPEG and its descriptive alt text.
      }
    }
    if (gochujang) $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const lane = href.match(/^\/recipes\/\?lane=(traditional|modern|fusion)$/)?.[1];
      if (lane) $(el).attr('href', `/collections/${lane}/`);
    });
    for (const font of fonts) $(`link[href="${font.original}"]`).attr('href',font.optimized);

    // Preserve each original fallback image, its crop, dimensions, alt text, and styling.
    $('img').each((_, el) => {
      const img = $(el), slug = imageBySrc.get(img.attr('src')), asset = optimized[slug] || editorialBySrc.get(img.attr('src'));
      if (!asset) return;
      const mobile = 'calc(100vw - 40px)';
      let sizes = img.attr('sizes') || '100vw';
      if (img.attr('data-display-sizes')) sizes=img.attr('data-display-sizes');
      else if (img.closest('.collection-heading-photo').length) sizes='(max-width:760px) 1px, (max-width:1440px) 30vw, 430px';
      else if (img.closest('.editorial-grid').length) sizes=img.closest('.recipe-tile').is(':first-child') ? '(max-width:760px) calc(100vw - 40px), (max-width:1440px) 50vw, 700px' : '(max-width:760px) calc((100vw - 60px) / 2), (max-width:1440px) 23vw, 320px';
      else if (img.hasClass('hero-photo')) sizes = `(max-width:760px) ${mobile}, (max-width:1480px) 47vw, 640px`;
      else if (img.closest('.recipe-hero').length) sizes = gochujang
        ? `(max-width:760px) ${mobile}, (max-width:1440px) 91vw, 1280px`
        : `(max-width:760px) ${mobile}, (max-width:1480px) 43vw, 630px`;
      else if (img.closest('.recipe-tile').length) {
        const tile = img.closest('.recipe-tile'), grid = tile.parent();
        const fullMobile = !grid.hasClass('collection-grid') && tile.is(':last-child') && grid.children('.recipe-tile').length % 2;
        sizes = `(max-width:760px) ${fullMobile ? mobile : 'calc((100vw - 60px) / 2)'}, (max-width:1480px) 29vw, 430px`;
      } else if (img.closest('.about-photo,.about-image').length) sizes = `(max-width:760px) ${mobile}, (max-width:1480px) 91vw, 1328px`;
      else if (img.closest('.category-cover').length) sizes = `(max-width:760px) ${mobile}, 270px`;
      else if (img.closest('.sea-row').length) sizes = '(max-width:760px) 40vw, 20vw';
      else sizes = `(max-width:760px) ${mobile}, (max-width:1480px) 46vw, 640px`;
      sizes = coverAwareSizes(sizes, { width: img.attr('width'), height: img.attr('height') }, { $, img, gochujang });
      img.attr('sizes', sizes).wrap('<picture></picture>');
      img.before($('<source>').attr({type:'image/avif',srcset:asset.srcset,sizes}));
      if (img.attr('fetchpriority') === 'high' && !$('link[rel="preload"][as="image"]').length) {
        $('head').append($('<link>').attr({rel:'preload',as:'image',type:'image/avif',imagesrcset:asset.srcset,imagesizes:sizes,fetchpriority:'high'}));
      }
    });

    const org = {'@type':'Organization','@id':`${domain}/#organization`,name:brand,url:`${domain}/`};
    const website = {'@type':'WebSite','@id':`${domain}/#website`,url:`${domain}/`,name:brand,alternateName:gochujang?'Gochujang — The Seoul Table':'KBBQGuide — Ember & Ink',inLanguage:'en',publisher:{'@id':org['@id']}};
    const graph = [org, website];
    const page = {'@type':recipe?'WebPage':route==='/about/'?'AboutPage':isCollection?'CollectionPage':'WebPage','@id':`${canonical}#webpage`,url:canonical,name:title,description,inLanguage:'en',isPartOf:{'@id':website['@id']}};
    if (!notFound) graph.push(page);
    if (recipe) {
      const node = $('script[type="application/ld+json"]').first();
      const schema = JSON.parse(node.text());
      schema['@id'] = `${canonical}#recipe`;
      schema.inLanguage = 'en';
      schema.author = {...schema.author, '@id':org['@id'],url:`${domain}/about/`};
      schema.mainEntityOfPage = {'@id':page['@id']};
      schema.recipeInstructions = schema.recipeInstructions.map((step,index) => ({...step,url:`${canonical}#step-${index+1}`}));
      $('.method-step').each((index, el) => $(el).attr('id',`step-${index+1}`));
      node.text(json(schema));
      page.mainEntity = {'@id':schema['@id']};
    }
    if (!notFound && route !== '/') {
      let crumbs = $('.breadcrumbs a').map((_, el) => ({name:$(el).text().trim(),item:new URL($(el).attr('href'),domain).href})).get();
      if (!crumbs.length) crumbs = [{name:'Home',item:`${domain}/`}];
      if (route.startsWith('/collections/') && !crumbs.some(c=>c.item===`${domain}/recipes/`)) crumbs.push({name:'Recipes',item:`${domain}/recipes/`});
      crumbs.push({name:recipe?.title || title.split(' | ')[0],item:canonical});
      graph.push({'@type':'BreadcrumbList','@id':`${canonical}#breadcrumb`,itemListElement:crumbs.map((c,index)=>({'@type':'ListItem',position:index+1,...c}))});
      page.breadcrumb={'@id':`${canonical}#breadcrumb`};
    }
    if (isCollection) {
      const slugs = $('[data-recipe]').map((_,el)=>$(el).attr('data-slug')).get();
      graph.push({'@type':'ItemList','@id':`${canonical}#recipes`,name:title.split(' | ')[0],numberOfItems:slugs.length,itemListElement:slugs.map((slug,index)=>({'@type':'ListItem',position:index+1,url:`${domain}/recipes/${slug}/`}))});
      page.mainEntity={'@id':`${canonical}#recipes`};
    }
    $('head').append(`<script type="application/ld+json" data-site-schema>${json({'@context':'https://schema.org','@graph':graph})}</script>`);
    await writeFile(file, $.html());
    if (!notFound) sitemap.push({url:canonical,recipe});
  }
  await writeFile(path.join(out,'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${sitemap.map(({url,recipe})=>`<url><loc>${escapeXML(url)}</loc>${recipe?`<image:image><image:loc>${escapeXML(domain+images[recipe.slug].jpg)}</image:loc></image:image>`:''}</url>`).join('')}</urlset>`);
  console.log(`SEO: ${sitemap.length} indexable pages, ${recipes.length} recipe images in sitemap, responsive AVIF and subset fonts.`);
}
