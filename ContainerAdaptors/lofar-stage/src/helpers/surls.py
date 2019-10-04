def get_surls(observation_id, username, password):
    from common.config.Profile import profiles
    profile = profiles.create_profile(username, password)

    from awlofar.database.Context import context
    from common.config.Profile import profiles
    from common.database.Database import database
    from awlofar.main.aweimports import CorrelatedDataProduct, \
        FileObject, BeamFormedDataProduct, Observation
    from awlofar.toolbox.LtaStager import LtaStager, LtaStagerError  

    if not database.connected():
        profile = profiles.get_current_profile()
        if profile is None:
            profile = profiles.create_profile(username, password)
        
        database.connect()

    cdp = CorrelatedDataProduct

    query_observations = Observation.observationId == observation_id
    surls = []
    for observation in query_observations:
        dataproduct_query = cdp.observations.contains(observation)
        dataproduct_query &= cdp.isValid == 1
        
        for dataproduct in dataproduct_query:
            fileobject = ((FileObject.data_object == dataproduct) & (FileObject.isValid > 0)).max('creation_date')
            if fileobject:
                surls.append(fileobject.URI)

    return surls
