#!/usr/bin/env python3
"""
Decentralized Search API using The Graph + TF-IDF ranking

Flow:
  1. User makes a GET request to /search?q=searchTerm.
  2. The API queries your subgraph for agents whose 'searchText' contains the searchTerm
     (case-insensitive) and isActive = true, in batches (max 1000 per query).
  3. All filtered agents are then ranked off-chain via TF-IDF on the 'description' field.
  4. The top 10 ranked agents are returned as JSON.

Configuration:
  - SUBGRAPH_URL: Set this environment variable to your subgraph GraphQL endpoint.
    e.g., "https://api.studio.thegraph.com/query/xxxx/ai-agent-index/version/latest"
"""

import os
from dotenv import load_dotenv
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Environment variable for your subgraph endpoint on The Graph
SUBGRAPH_URL = os.environ.get("SUBGRAPH_URL", "")
# The Graph typically returns at most 1000 records per query.
PAGE_SIZE = 1000

def fetch_agents_from_subgraph(search_term):
    """
    Fetch agents from your subgraph whose 'searchText' contains 'search_term' (case-insensitive)
    and 'isActive' is true. We do this in paginated batches of PAGE_SIZE until no more remain.
    """
    if not SUBGRAPH_URL:
        raise ValueError("SUBGRAPH_URL environment variable is not set.")

    agents = []
    skip = 0

    while True:
        # GraphQL query to your subgraph:
        graphql_query = """
        query ($term: String!, $first: Int!, $skip: Int!) {
          agents(
            where: {
              searchText_contains_nocase: $term,
              isActive: true
            },
            orderBy: name,
            orderDirection: asc,
            first: $first,
            skip: $skip
          ) {
            id
            name
            socialLink
            profileUrl
            address
            description
            adminAddress
            isActive
            lastUpdateTime
          }
        }
        """

        variables = {
            "term": search_term,
            "first": PAGE_SIZE,
            "skip": skip
        }

        # Execute the GraphQL query
        response = requests.post(
            SUBGRAPH_URL,
            json={"query": graphql_query, "variables": variables}
        )

        if response.status_code != 200:
            raise Exception(
                f"GraphQL query failed with status {response.status_code}: {response.text}"
            )

        data = response.json()
        if "errors" in data:
            raise Exception(f"GraphQL returned errors: {data['errors']}")

        batch = data["data"]["agents"]
        if not batch:
            break  # No more agents to fetch
        agents.extend(batch)

        # If this batch has fewer than PAGE_SIZE agents, we've reached the end
        if len(batch) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    return agents

def rank_agents(search_term, agents):
    """
    Given a search term and a list of agent objects, rank them by TF-IDF similarity
    based on their 'description' field, and return the top 10 results.
    """
    if not agents:
        return []

    # Extract descriptions. 
    # If you prefer to rank by name+description, do something like:
    # texts = [agent["name"] + " " + agent["description"] for agent in agents]
    texts = [agent["description"] for agent in agents]

    # Build TF-IDF vectors for the agents' descriptions
    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf_matrix = vectorizer.fit_transform(texts)

    # Transform the user's search term into the same TF-IDF space
    query_vector = vectorizer.transform([search_term])

    # Compute cosine similarity between the query and each agent's text
    similarities = cosine_similarity(query_vector, tfidf_matrix).flatten()

    # Sort by similarity, descending
    top_indices = similarities.argsort()[::-1]

    # If fewer than 10 total agents, return them all; otherwise return top 10
    top_indices = top_indices[:10]

    # Build the final list of top agents with their similarity scores
    ranked_results = []
    for idx in top_indices:
        agent = agents[idx]
        agent["score"] = float(similarities[idx])
        ranked_results.append(agent)

    return ranked_results

@app.route('/search', methods=['GET'])
def search():
    """
    API endpoint: Expects a query parameter "q".
    1) Fetch all matching agents from subgraph (searchText_contains_nocase).
    2) Rank them with TF-IDF (based on 'description').
    3) Return top 10.
    """
    user_query = request.args.get("q", "").strip()
    if not user_query:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    try:
        # 1) Fetch matching agents from the subgraph
        agents = fetch_agents_from_subgraph(user_query)

        # 2) Rank them using TF-IDF on the 'description' field
        top_agents = rank_agents(user_query, agents)

        # 3) Return the top results as JSON
        return jsonify(top_agents), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    if not SUBGRAPH_URL:
        print("Please set the SUBGRAPH_URL environment variable to your subgraph's endpoint.")
        exit(1)

    # Start the API server on port 5000 (or specify your own)
    app.run(host="0.0.0.0", port=5001)
