// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AIAgentIndex {
    struct Agent {
        string name;           // Agent name
        string address_;       // Named 'address_' because 'address' is a reserved word
        string socialLink;     // Social media link
        string profileUrl;     // Profile URL
        string description;    // Agent description
        bool isActive;         // Status flag
    }
    
    address public owner;
    mapping(uint256 => Agent) public agents;
    uint256 public agentCount;
    mapping(address => bool) public authorizedUpdaters;
    
    event AgentAdded(uint256 indexed id, string name);
    event AgentUpdated(uint256 indexed id, string name);
    
    constructor() {
        owner = msg.sender;
        authorizedUpdaters[msg.sender] = true;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }
    
    modifier onlyAuthorized() {
        require(authorizedUpdaters[msg.sender], "Not authorized");
        _;
    }
    
    function addAuthorizedUpdater(address updater) public onlyOwner {
        authorizedUpdaters[updater] = true;
    }
    
    function addAgent(
        string memory _name,
        string memory _address,
        string memory _socialLink,
        string memory _profileUrl,
        string memory _description
    ) public onlyAuthorized returns (uint256) {
        uint256 newAgentId = agentCount;
        agents[newAgentId] = Agent({
            name: _name,
            address_: _address,
            socialLink: _socialLink,
            profileUrl: _profileUrl,
            description: _description,
            isActive: true
        });
        
        agentCount++;
        emit AgentAdded(newAgentId, _name);
        return newAgentId;
    }
    
    function updateAgent(
        uint256 _id,
        string memory _name,
        string memory _address,
        string memory _socialLink,
        string memory _profileUrl,
        string memory _description,
        bool _isActive
    ) public onlyAuthorized {
        require(_id < agentCount, "Agent does not exist");
        Agent storage agent = agents[_id];
        
        agent.name = _name;
        agent.address_ = _address;
        agent.socialLink = _socialLink;
        agent.profileUrl = _profileUrl;
        agent.description = _description;
        agent.isActive = _isActive;
        
        emit AgentUpdated(_id, _name);
    }
    
    function getAgent(uint256 _id) public view returns (
        string memory name,
        string memory address_,
        string memory socialLink,
        string memory profileUrl,
        string memory description,
        bool isActive
    ) {
        require(_id < agentCount, "Agent does not exist");
        Agent memory agent = agents[_id];
        return (
            agent.name,
            agent.address_,
            agent.socialLink,
            agent.profileUrl,
            agent.description,
            agent.isActive
        );
    }
}