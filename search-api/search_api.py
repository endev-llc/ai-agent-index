#!/usr/bin/env python3
"""
Decentralized Search API using The Graph + TF-IDF ranking

Flow:
  1. User makes a GET request to /search?q=searchTerm.
  2. The API queries your subgraph for agents whose 'isActive' is true
     in batches (max 1000 per query). (Currently, the searchTerm is not used in the subgraph query.)
  3. All fetched agents are then ranked off-chain via TF-IDF, incorporating
     name, description, socialLink, profileUrl, address, adminAddress (with different importances).
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
    Fetch agents from your subgraph whose 'isActive' is true,
    in paginated batches of PAGE_SIZE until no more remain.

    NOTE: The current GraphQL query does NOT filter by 'search_term' on-chain.
    Instead, we fetch all isActive agents, and rely on local TF-IDF ranking
    in 'rank_agents()' to match the search term. If you want to filter at
    the subgraph level, you'd add a 'searchText_contains_nocase: search_term' condition.
    """
    if not SUBGRAPH_URL:
        raise ValueError("SUBGRAPH_URL environment variable is not set.")

    agents = []
    skip = 0

    while True:
        graphql_query = """
        query ($first: Int!, $skip: Int!) {
          agents(
            where: {
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
            "term": search_term,  # Currently unused in the GraphQL query
            "first": PAGE_SIZE,
            "skip": skip
        }

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
    based on multiple fields:
      - name (highest importance)
      - description (second highest)
      - socialLink, profileUrl, address, adminAddress (tied for third highest)
    Return the top 10 results.
    """
    if not agents:
        return []

    # Build a weighted text for each agent. 
    # We'll repeat the name 3 times, the description 2 times, 
    # and each of the other fields 1 time.
    ranking_texts = []
    for agent in agents:
        name = agent.get("name", "") or ""
        description = agent.get("description", "") or ""
        socialLink = agent.get("socialLink", "") or ""
        profileUrl = agent.get("profileUrl", "") or ""
        address = agent.get("address", "") or ""
        adminAddress = agent.get("adminAddress", "") or ""

        # Weighted combination
        combined_text = (
            (name + " ") * 3 +           # highest importance
            (description + " ") * 2 +    # second highest importance
            socialLink + " " +           # third importance
            profileUrl + " " +           # third importance
            address + " " +              # third importance
            adminAddress                 # third importance
        )
        ranking_texts.append(combined_text)

    # Build TF-IDF vectors for the combined texts
    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf_matrix = vectorizer.fit_transform(ranking_texts)

    # Transform the user's search term into the same TF-IDF space
    # (No special weighting needed here—it's just the query.)
    query_vector = vectorizer.transform([search_term])

    # Compute cosine similarity between the query and each agent's weighted text
    similarities = cosine_similarity(query_vector, tfidf_matrix).flatten()

    # Sort by similarity in descending order
    top_indices = similarities.argsort()[::-1]

    # Return up to the top 10
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
    1) Fetch all isActive agents from subgraph.
    2) Rank them with TF-IDF, taking into account name, description,
       socialLink, profileUrl, address, and adminAddress (with different importances).
    3) Return the top 10.
    """
    user_query = request.args.get("q", "").strip()
    if not user_query:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    try:
        # 1) Fetch matching agents from the subgraph
        agents = fetch_agents_from_subgraph(user_query)

        # 2) Rank them using TF-IDF on the weighted combination of fields
        top_agents = rank_agents(user_query, agents)

        # 3) Return the top results as JSON
        return jsonify(top_agents), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    if not SUBGRAPH_URL:
        print("Please set the SUBGRAPH_URL environment variable to your subgraph's endpoint.")
        exit(1)

    # Start the API server on port 5001 (adjust as needed)
    app.run(host="0.0.0.0", port=5001)