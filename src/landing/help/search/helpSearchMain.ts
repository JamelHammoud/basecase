import { HELP_SEARCH_IDS } from '../helpSearchIds';
import { attachSearch, loadIndex } from './searchBox';
import { SEARCH_INDEX_PATH } from './searchPaths';

const form = document.querySelector<HTMLFormElement>('form[data-help-search]');
const input = document.getElementById(HELP_SEARCH_IDS.input);
const list = document.getElementById(HELP_SEARCH_IDS.results);

if (form && input instanceof HTMLInputElement && list) {
  attachSearch({ form, input, list }, loadIndex(SEARCH_INDEX_PATH));
}
