import {applyMiddleware, createStore, combineReducers} from 'redux';
import {entitiesReducer, queriesReducer, queryMiddleware} from 'redux-query';
import superagentInterface from 'redux-query-interface-superagent';

const reducer = combineReducers({
  entities: entitiesReducer,
  queries: queriesReducer,
});

export type RootState = ReturnType<typeof reducer>;

export const getQueries = (state: RootState) => state.queries;
export const getEntities = (state: RootState) => state.entities;

const store = createStore(
  reducer,
  applyMiddleware(
    queryMiddleware(superagentInterface, getQueries, getEntities),
  ),
);

export default store;
