// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Proxy contract for upgradability
contract AIAgentIndexProxy {
    address public implementation;
    address public owner;
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }
    
    function upgradeTo(address newImplementation) public onlyOwner {
        implementation = newImplementation;
    }
    
    fallback() external payable {
        address _impl = implementation;
        require(_impl != address(0), "Implementation not set");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), _impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    
    receive() external payable {}
}

contract AIAgentIndex {
    struct Agent {
        string name;
        string address_;
        string socialLink;
        string profileUrl;
        string description;
        bool isActive;
        uint256 addedAt;
        address owner;         // Owner of this agent entry (technical control)
        uint256 lastUpdateTime;
        string admin_address;  // NEW: Displayed admin address (can be empty)
    }
    
    struct SearchResult {
        uint256 id;
        Agent agent;
    }

    struct RankedResult {
        uint256 id;
        Agent agent;
        uint256 rank;
    }
    
    // Constants for validation
    uint256 public constant MAX_NAME_LENGTH = 100;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 5000;
    uint256 public constant MAX_URL_LENGTH = 500;
    uint256 public constant MIN_LISTING_FEE = 0.0001 ether;
    
    // Storage layout (must maintain order for upgradability)
    address public owner;
    mapping(uint256 => Agent) public agents;
    uint256 public agentCount;
    uint256 public listingFee;
    address public feeCollector;
    
    // Additional mappings for search functionality
    mapping(string => uint256[]) private addressToIds;
    mapping(string => uint256[]) private nameToIds;
    
    // NEW: Mapping for pending admin transfers
    mapping(uint256 => address) public pendingAdmins;
    
    // Existing events
    event AgentAdded(uint256 indexed id, string name, uint256 timestamp, address indexed owner);
    event AgentUpdated(uint256 indexed id, string name, address indexed owner);
    event AgentDeactivated(uint256 indexed id, address indexed owner);
    event AgentReactivated(uint256 indexed id, address indexed owner);
    event FeeUpdated(uint256 newFee);
    event FeeCollectorUpdated(address newCollector);
    
    // NEW: Events for admin transfer
    event AdminTransferRequested(uint256 indexed agentId, address indexed currentAdmin, address indexed proposedAdmin);
    event AdminTransferred(uint256 indexed agentId, address indexed oldAdmin, address indexed newAdmin);
    
    bool private initialized;
    
    constructor() {
        owner = msg.sender;
    }
    
    function initialize(address _feeCollector, uint256 _listingFee) public {
        require(!initialized, "Contract already initialized");
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_listingFee >= MIN_LISTING_FEE, "Fee too low");
        
        feeCollector = _feeCollector;
        listingFee = _listingFee;
        initialized = true;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }
    
    modifier onlyAgentOwner(uint256 _id) {
        require(_id < agentCount, "Agent does not exist");
        require(msg.sender == agents[_id].owner, "Only agent owner can modify");
        _;
    }
    
    // MODIFIED: Removed _containsValidChars check from validString modifier
    modifier validString(string memory str, uint256 maxLength) {
        require(bytes(str).length > 0, "String cannot be empty");
        require(bytes(str).length <= maxLength, "String too long");
        _;
    }
    
    function setListingFee(uint256 _newFee) public onlyOwner {
        require(_newFee >= MIN_LISTING_FEE, "Fee too low");
        listingFee = _newFee;
        emit FeeUpdated(_newFee);
    }
    
    function setFeeCollector(address _newCollector) public onlyOwner {
        require(_newCollector != address(0), "Invalid fee collector");
        feeCollector = _newCollector;
        emit FeeCollectorUpdated(_newCollector);
    }
    
    // MODIFIED: Updated addAgent function with admin_address
    function addAgent(
        string memory _name,
        string memory _address,
        string memory _socialLink,
        string memory _profileUrl,
        string memory _description,
        string memory _admin_address  // NEW: Optional admin_address parameter
    ) public payable 
      validString(_name, MAX_NAME_LENGTH)
      validString(_address, MAX_URL_LENGTH)
      validString(_socialLink, MAX_URL_LENGTH)
      validString(_profileUrl, MAX_URL_LENGTH)
      validString(_description, MAX_DESCRIPTION_LENGTH)
    returns (uint256) {
        require(msg.value >= listingFee, "Insufficient listing fee");
        
        uint256 newAgentId = agentCount;
        agents[newAgentId] = Agent({
            name: _name,
            address_: _address,
            socialLink: _socialLink,
            profileUrl: _profileUrl,
            description: _description,
            isActive: true,
            addedAt: block.timestamp,
            owner: msg.sender,
            lastUpdateTime: block.timestamp,
            admin_address: _admin_address  // NEW: Set initial admin_address
        });
        
        // Update search mappings
        addressToIds[_address].push(newAgentId);
        nameToIds[_name].push(newAgentId);
        
        // Transfer fee
        (bool sent,) = feeCollector.call{value: listingFee}("");
        require(sent, "Fee transfer failed");
        
        // Refund excess
        if (msg.value > listingFee) {
            (bool refundSent,) = msg.sender.call{value: msg.value - listingFee}("");
            require(refundSent, "Failed to refund excess");
        }
        
        agentCount++;
        emit AgentAdded(newAgentId, _name, block.timestamp, msg.sender);
        return newAgentId;
    }
    
    // NEW: Function to initiate admin transfer
    function transferAgentAdmin(uint256 _agentId, address _newAdmin) public onlyAgentOwner(_agentId) {
        require(_newAdmin != address(0), "New admin cannot be zero address");
        require(_newAdmin != agents[_agentId].owner, "New admin cannot be current admin");
        
        pendingAdmins[_agentId] = _newAdmin;
        emit AdminTransferRequested(_agentId, agents[_agentId].owner, _newAdmin);
    }
    
    // NEW: Function to accept admin transfer
    function acceptAgentAdmin(uint256 _agentId) public {
        require(msg.sender == pendingAdmins[_agentId], "Only pending admin can accept");
        require(agents[_agentId].owner != address(0), "Agent does not exist");
        
        address oldAdmin = agents[_agentId].owner;
        agents[_agentId].owner = msg.sender;
        agents[_agentId].admin_address = toAsciiString(msg.sender);
        delete pendingAdmins[_agentId];
        
        emit AdminTransferred(_agentId, oldAdmin, msg.sender);
    }
    
    // NEW: Function to cancel admin transfer
    function cancelAdminTransfer(uint256 _agentId) public onlyAgentOwner(_agentId) {
        require(pendingAdmins[_agentId] != address(0), "No pending admin transfer");
        delete pendingAdmins[_agentId];
    }
    
    // NEW: Helper function to convert address to string
    function toAsciiString(address x) private pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }
    
    // NEW: Helper function for toAsciiString
    function char(bytes1 b) private pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
    
    function updateAgent(
        uint256 _id,
        string memory _name,
        string memory _address,
        string memory _socialLink,
        string memory _profileUrl,
        string memory _description
    ) public onlyAgentOwner(_id)
      validString(_name, MAX_NAME_LENGTH)
      validString(_address, MAX_URL_LENGTH)
      validString(_socialLink, MAX_URL_LENGTH)
      validString(_profileUrl, MAX_URL_LENGTH)
      validString(_description, MAX_DESCRIPTION_LENGTH)
    {
        // Remove old search mappings
        _removeFromSearchMappings(_id);
        
        // Update agent
        agents[_id].name = _name;
        agents[_id].address_ = _address;
        agents[_id].socialLink = _socialLink;
        agents[_id].profileUrl = _profileUrl;
        agents[_id].description = _description;
        agents[_id].lastUpdateTime = block.timestamp;
        
        // Add new search mappings
        addressToIds[_address].push(_id);
        nameToIds[_name].push(_id);
        
        emit AgentUpdated(_id, _name, msg.sender);
    }
    
    function deactivateAgent(uint256 _id) public onlyAgentOwner(_id) {
        require(agents[_id].isActive, "Agent already inactive");
        agents[_id].isActive = false;
        emit AgentDeactivated(_id, msg.sender);
    }
    
    function reactivateAgent(uint256 _id) public payable onlyAgentOwner(_id) {
        require(!agents[_id].isActive, "Agent already active");
        require(msg.value >= listingFee, "Insufficient fee");
        
        agents[_id].isActive = true;
        agents[_id].lastUpdateTime = block.timestamp;
        
        // Transfer fee
        (bool sent,) = feeCollector.call{value: listingFee}("");
        require(sent, "Fee transfer failed");
        
        // Refund excess
        if (msg.value > listingFee) {
            (bool refundSent,) = msg.sender.call{value: msg.value - listingFee}("");
            require(refundSent, "Failed to refund excess");
        }
        
        emit AgentReactivated(_id, msg.sender);
    }
    
    function _removeFromSearchMappings(uint256 _id) private {
        Agent memory agent = agents[_id];
        
        // Remove from address mapping
        uint256[] storage addressIds = addressToIds[agent.address_];
        for (uint256 i = 0; i < addressIds.length; i++) {
            if (addressIds[i] == _id) {
                addressIds[i] = addressIds[addressIds.length - 1];
                addressIds.pop();
                break;
            }
        }
        
        // Remove from name mapping
        uint256[] storage nameIds = nameToIds[agent.name];
        for (uint256 i = 0; i < nameIds.length; i++) {
            if (nameIds[i] == _id) {
                nameIds[i] = nameIds[nameIds.length - 1];
                nameIds.pop();
                break;
            }
        }
    }
    
    function searchByAddress(string memory _address) public view returns (SearchResult[] memory) {
        uint256[] memory ids = addressToIds[_address];
        return _buildSearchResults(ids);
    }
    
    function searchByName(string memory _name) public view returns (SearchResult[] memory) {
        uint256[] memory ids = nameToIds[_name];
        return _buildSearchResults(ids);
    }
    
    function searchByKeyword(string memory keyword) public view returns (SearchResult[] memory) {
        // First pass to count matching results
        uint256 matchCount = 0;
        for (uint256 i = 0; i < agentCount; i++) {
            Agent memory agent = agents[i];
            if (agent.isActive && (
                _containsIgnoreCase(agent.name, keyword) ||
                _containsIgnoreCase(agent.description, keyword) ||
                _containsIgnoreCase(agent.address_, keyword) ||
                _containsIgnoreCase(agent.socialLink, keyword) ||
                _containsIgnoreCase(agent.profileUrl, keyword) ||
                _containsIgnoreCase(agent.admin_address, keyword)
            )) {
                matchCount++;
            }
        }

        // Create temporary array for ranking
        RankedResult[] memory rankedResults = new RankedResult[](matchCount);
        uint256 resultIndex = 0;

        // Second pass to collect and rank results
        for (uint256 i = 0; i < agentCount; i++) {
            Agent memory agent = agents[i];
            
            // Skip inactive agents
            if (!agent.isActive) continue;

            // Check if agent matches search criteria
            bool matches = false;
            uint256 rank = 0;

            // Name matches (highest priority - 1000 points)
            if (_containsIgnoreCase(agent.name, keyword)) {
                matches = true;
                rank += 1000;
            }

            // Description matches (second priority - 500 points)
            if (_containsIgnoreCase(agent.description, keyword)) {
                matches = true;
                rank += 500;
            }

            // Other fields (100 points each)
            if (_containsIgnoreCase(agent.address_, keyword)) {
                matches = true;
                rank += 100;
            }
            if (_containsIgnoreCase(agent.socialLink, keyword)) {
                matches = true;
                rank += 100;
            }
            if (_containsIgnoreCase(agent.profileUrl, keyword)) {
                matches = true;
                rank += 100;
            }
            if (_containsIgnoreCase(agent.admin_address, keyword)) {
                matches = true;
                rank += 100;
            }

            // If there's any match, add to results
            if (matches) {
                rankedResults[resultIndex] = RankedResult(i, agent, rank);
                resultIndex++;
            }
        }

        // Sort results by rank (bubble sort - can be optimized if needed)
        for (uint256 i = 0; i < matchCount - 1; i++) {
            for (uint256 j = 0; j < matchCount - i - 1; j++) {
                if (rankedResults[j].rank < rankedResults[j + 1].rank) {
                    RankedResult memory temp = rankedResults[j];
                    rankedResults[j] = rankedResults[j + 1];
                    rankedResults[j + 1] = temp;
                }
            }
        }

        // Create final SearchResult array
        SearchResult[] memory finalResults = new SearchResult[](matchCount);
        for (uint256 i = 0; i < matchCount; i++) {
            finalResults[i] = SearchResult(rankedResults[i].id, rankedResults[i].agent);
        }

        return finalResults;
    }

    // Update the _containsIgnoreCase function to better handle partial matches
    function _containsIgnoreCase(string memory source, string memory search) private pure returns (bool) {
        if (bytes(source).length == 0 || bytes(search).length == 0) {
            return false;
        }

        bytes memory sourceBytes = bytes(source);
        bytes memory searchBytes = bytes(search);

        if (searchBytes.length > sourceBytes.length) return false;

        for (uint256 i = 0; i <= sourceBytes.length - searchBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < searchBytes.length; j++) {
                bytes1 sourceChar = sourceBytes[i + j];
                bytes1 searchChar = searchBytes[j];

                // Convert both characters to lowercase for comparison
                uint8 sourceLower = uint8(sourceChar);
                if (sourceLower >= 65 && sourceLower <= 90) {
                    sourceLower += 32;
                }
                
                uint8 searchLower = uint8(searchChar);
                if (searchLower >= 65 && searchLower <= 90) {
                    searchLower += 32;
                }

                if (sourceLower != searchLower) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }
    
    function _buildSearchResults(uint256[] memory ids) private view returns (SearchResult[] memory) {
        SearchResult[] memory results = new SearchResult[](ids.length);
        uint256 resultCount = 0;
        
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] < agentCount && agents[ids[i]].isActive) {
                results[resultCount] = SearchResult(ids[i], agents[ids[i]]);
                resultCount++;
            }
        }
        
        return results;
    }
    
    function getAgent(uint256 _id) public view returns (Agent memory) {
        require(_id < agentCount, "Agent does not exist");
        return agents[_id];
    }
}