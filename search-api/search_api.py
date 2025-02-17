#!/usr/bin/env python3
"""
Decentralized Search API using The Graph + Hybrid Ranking (TF‑IDF + Weighted Substring Frequency)

Flow:
  1. User makes a GET request to /search?q=searchTerm.
  2. The API queries your subgraph for agents whose 'isActive' is true
     in batches (max 1000 per query).
  3. For each agent, two scores are computed:
       a) A TF‑IDF cosine similarity score computed on a weighted combination of fields.
       b) A weighted substring frequency score computed by counting occurrences of the search term.
          If the search term consists of multiple words, both the entire phrase and each individual word are counted.
  4. Each set of scores is normalized to a 0–1 range and combined equally (50% each) into a final ranking score.
  5. The top 10 ranked agents (with a nonzero final score) are returned as JSON.

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

SUBGRAPH_URL = os.environ.get("SUBGRAPH_URL", "")
PAGE_SIZE = 1000  # The Graph typically returns at most 1000 records per query.

def fetch_agents_from_subgraph(search_term):
    """
    Fetch agents from your subgraph whose 'isActive' is true,
    in paginated batches of PAGE_SIZE until no more remain.
    
    NOTE: The current GraphQL query does not filter by search_term on-chain.
    We fetch all active agents and then rank them locally.
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
            "first": PAGE_SIZE,
            "skip": skip
        }

        response = requests.post(
            SUBGRAPH_URL,
            json={"query": graphql_query, "variables": variables}
        )

        if response.status_code != 200:
            raise Exception(f"GraphQL query failed with status {response.status_code}: {response.text}")

        data = response.json()
        if "errors" in data:
            raise Exception(f"GraphQL returned errors: {data['errors']}")

        batch = data["data"]["agents"]
        if not batch:
            break  # No more agents to fetch
        agents.extend(batch)

        if len(batch) < PAGE_SIZE:
            break  # End of data reached
        skip += PAGE_SIZE

    return agents

def rank_agents_hybrid(search_term, agents):
    """
    Compute a hybrid ranking score for each agent using:
      1) TF‑IDF cosine similarity score computed on a weighted combination of fields:
           - name repeated 3 times (highest importance)
           - description repeated 2 times (second highest)
           - socialLink, profileUrl, address, adminAddress (each once, tied for third)
      2) Weighted substring frequency score computed by counting (case‑insensitive)
         occurrences of the search term in the same fields with the same weights.
         If the search term contains multiple words, both the entire phrase and each individual word are counted.
    
    Each set of scores is normalized (by dividing by its maximum value) so that both lie in the range [0,1],
    then combined equally (50% each) into a final score.
    Returns the top 10 agents with a final score above zero.
    """
    if not agents:
        return []

    # Prepare the weighted text for each agent (for TF-IDF)
    weighted_texts = []
    for agent in agents:
        name = agent.get("name", "") or ""
        description = agent.get("description", "") or ""
        socialLink = agent.get("socialLink", "") or ""
        profileUrl = agent.get("profileUrl", "") or ""
        address = agent.get("address", "") or ""
        adminAddress = agent.get("adminAddress", "") or ""
        
        combined_text = (
            (name + " ") * 3 +
            (description + " ") * 2 +
            socialLink + " " +
            profileUrl + " " +
            address + " " +
            adminAddress
        )
        weighted_texts.append(combined_text)

    # -------------------------------------
    # 1) TF-IDF based ranking
    # -------------------------------------
    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf_matrix = vectorizer.fit_transform(weighted_texts)
    query_vector = vectorizer.transform([search_term])
    tfidf_scores = cosine_similarity(query_vector, tfidf_matrix).flatten()  # values between 0 and 1

    # Normalize TF-IDF scores (max-based normalization)
    max_tfidf = max(tfidf_scores) if max(tfidf_scores) > 0 else 1
    normalized_tfidf = [score / max_tfidf for score in tfidf_scores]

    # -------------------------------------
    # 2) Weighted substring frequency scoring
    # -------------------------------------
    # Prepare tokens: always include the entire search term.
    # If multiple words are present, also include each individual word.
    search_term_lower = search_term.lower()
    tokens = [search_term_lower]
    if " " in search_term_lower:
        tokens += search_term_lower.split()

    substring_scores = []
    for agent in agents:
        name = agent.get("name", "") or ""
        description = agent.get("description", "") or ""
        socialLink = agent.get("socialLink", "") or ""
        profileUrl = agent.get("profileUrl", "") or ""
        address = agent.get("address", "") or ""
        adminAddress = agent.get("adminAddress", "") or ""

        # For each field, count occurrences for all tokens and apply field weight
        name_count = 5 * sum(name.lower().count(token) for token in tokens)
        desc_count =  sum(description.lower().count(token) for token in tokens)
        social_count = sum(socialLink.lower().count(token) for token in tokens)
        profile_count = sum(profileUrl.lower().count(token) for token in tokens)
        address_count = sum(address.lower().count(token) for token in tokens)
        admin_count = sum(adminAddress.lower().count(token) for token in tokens)

        total_count = name_count + desc_count + social_count + profile_count + address_count + admin_count
        substring_scores.append(total_count)

    # Normalize substring frequency scores (max-based normalization)
    max_sub = max(substring_scores) if max(substring_scores) > 0 else 1
    normalized_sub = [score / max_sub for score in substring_scores]

    # -------------------------------------
    # 3) Combine scores equally (50% TF-IDF, 50% substring)
    # -------------------------------------
    final_scores = [0.5 * tfidf + 0.5 * sub
                    for tfidf, sub in zip(normalized_tfidf, normalized_sub)]

    # Assign final score to each agent
    for agent, score in zip(agents, final_scores):
        agent["score"] = score

    # Sort agents by final score in descending order and filter out zero scores
    ranked_agents = sorted([agent for agent in agents if agent["score"] > 0],
                           key=lambda x: x["score"],
                           reverse=True)
    return ranked_agents[:10]

@app.route('/search', methods=['GET'])
def search():
    """
    API endpoint: Expects a query parameter "q".
    1) Fetch all isActive agents from the subgraph.
    2) Rank them using the hybrid approach combining TF‑IDF and weighted substring frequency scoring.
       (When the search term contains multiple words, both the entire phrase and each word are considered.)
    3) Return the top 10 agents as JSON.
    """
    user_query = request.args.get("q", "").strip()
    if not user_query:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    try:
        agents = fetch_agents_from_subgraph(user_query)
        top_agents = rank_agents_hybrid(user_query, agents)
        return jsonify(top_agents), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    if not SUBGRAPH_URL:
        print("Please set the SUBGRAPH_URL environment variable to your subgraph's endpoint.")
        exit(1)
    app.run(host="0.0.0.0", port=5001)