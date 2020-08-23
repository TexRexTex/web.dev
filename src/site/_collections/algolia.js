/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const {livePosts} = require('../_filters/live-posts');
const removeMarkdown = require('remove-markdown');
const authorsCollectionFn = require('./authors');
const {feed: authorsFeed} = require('./hooks/authors');
const newslettersCollectionFn = require('./newsletters');
const tagsCollectionFn = require('./tags');
const {feed: tagsFeed} = require('./hooks/tags');

/**
 * Shrink the size of the given fulltext to fit within a certain limit, at the
 * nearest found newline character.
 *
 * @param {string} fulltext
 * @param {number=} limit
 * @return {string}
 */
function limitText(fulltext, limit = 7500) {
  if (fulltext.length <= limit) {
    return fulltext;
  }

  // Find the nearest prior newline to the 10k limit.
  let newlineIndex = fulltext.lastIndexOf('\n', limit);
  if (newlineIndex === -1) {
    newlineIndex = limit;
  }
  return fulltext.slice(0, newlineIndex);
}

module.exports = (collection) => {
  const validTags = ['post'];

  /** @type EleventyCollectionItem[] */
  const eleventyPosts = collection
    .getFilteredByGlob('**/*.md')
    .filter((item) => {
      // nb. There's no easy 'getFilteredByMultipleTag' method in Eleventy.
      if (!Array.isArray(item.data.tags)) {
        return false;
      }
      return item.data.tags.some((tag) => validTags.includes(tag));
    })
    .filter((item) => {
      return item.data.title && item.data.page.url;
    })
    .filter(livePosts);

  // For now, hard-code language to English.
  const lang = 'en';

  const authorsCollection = authorsCollectionFn(collection);
  const newslettersCollection = newslettersCollectionFn(collection);
  const tagsCollection = tagsCollectionFn(collection);

  // Convert 11ty-posts to a flat, indexable format.
  const posts = eleventyPosts.map(({data, template}) => {
    const fulltext = removeMarkdown(template.frontMatter.content);

    // Algolia has a limit of ~10k JSON on its records. For now, just trim fulltext to the nearest
    // line break below ~7500 characters (allowing buffer).
    // As of September 2019, this effects about 20 articles.
    // https://www.algolia.com/doc/guides/sending-and-managing-data/prepare-your-data/in-depth/index-and-records-size-and-usage-limitations/#record-size
    const limited = limitText(fulltext);

    const authors = (data.authors || []).map(
      (author) => authorsCollection[author].title,
    );

    return {
      objectID: data.page.url + '#' + lang,
      lang,
      title: data.title,
      url: data.canonicalUrl,
      description: data.description,
      fulltext: limited,
      authors: authors,
      _tags: data.tags,
    };
  });

  const authors = authorsFeed(Object.values(authorsCollection)).map(
    (author) => {
      return {
        objectID: author.href + '#' + lang,
        lang,
        title: author.title,
        url: author.data.canonicalUrl,
        description: author.description,
        fulltext: limitText(author.description),
      };
    },
  );

  const newsletters = newslettersCollection.map(({data, template}) => {
    const fulltext = removeMarkdown(template.frontMatter.content);
    const limited = limitText(fulltext);

    return {
      objectID: data.page.url + '#' + lang,
      lang,
      title: data.title,
      url: data.canonicalUrl,
      description: data.description,
      fulltext: limited,
    };
  });

  const tags = tagsFeed(Object.values(tagsCollection)).map((tag) => {
    return {
      objectID: tag.href + '#' + lang,
      lang,
      title: tag.title,
      url: tag.data.canonicalUrl,
      description: tag.description,
      fulltext: limitText(tag.description),
    };
  });

  return [...posts, ...authors, ...newsletters, ...tags];
};